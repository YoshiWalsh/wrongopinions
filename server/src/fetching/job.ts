import MyAnimeList, { UserListAnimeEntry } from "myanimelist-api";
import { DB } from "../db";
import { AnimeDetails, AnimeStatus } from "../model/AnimeDetails";
import { JobStatus, PendingJob } from "../model/PendingJob";
import { Contracts } from 'wrongopinions-common';
import { QueueDispatcher } from "./queueDispatcher";
import { Instant } from "@js-joda/core";
import { crunchJob } from "../crunching/cruncher";
import { QueueStatus } from "../model/QueueStatus";
import { AxiosError } from "axios";

const MAL_PAGE_SIZE = 1000;
const ESTIMATED_QUEUE_LATENCY = 5;
const ESTIMATED_SECONDS_PER_ANIME = 4;
const ESTIMATED_SECONDS_PER_JOB = 10;

export async function initialiseJob(db: DB, queue: QueueDispatcher, username: string): Promise<Contracts.PendingJobStatus> {
    console.log("Initialising job for", username);
    const mal = new MyAnimeList({
        clientId: process.env.MAL_CLIENT_ID as string,
        clientSecret: process.env.MAL_CLIENT_SECRET as string,
        axiosConfig: {
            headers: {
                'X-MAL-CLIENT-ID': process.env.MAL_CLIENT_ID,
            }
        },
    });

    console.log("Retrieving anime list");
    let animeList: Array<UserListAnimeEntry> = [];
    let offset = 0;
    try {
        while(true) {
            const result = await mal.user.listAnime(username, {
                limit: MAL_PAGE_SIZE,
                offset,
                fields: 'list_status',
                nsfw: true,
            });
            animeList = animeList.concat(result.data.data);
            if(!result.data.paging.next) {
                break;
            }
            offset += MAL_PAGE_SIZE;
        }
    } catch (ex: any) {
        if(ex.response) {
            if(ex.response.status == 403) {
                throw new Error("MAL profile is private");
            }
        }
    }

    const requiredAnime = animeList.map(a => a.node.id);
    
    console.log("Getting existing anime");
    const now = Date.now();
    const retrievedAnime = await db.bulkGetAnime(requiredAnime, false, true);

    const notFound = [];
    const notQueued = [];
    const queued = [];
    const cached = [];
    for(const id of requiredAnime) {
        const retrieved = retrievedAnime[id];

        if(!retrieved) {
            notFound.push(id);
            continue;
        }

        if(retrieved.animeStatus === AnimeStatus.Pending) {
            queued.push(id);
            continue
        }

        if(retrieved.expires && retrieved.expires > now) {
            cached.push(id);
            continue;
        }

        notQueued.push(id);
    }

    console.log("Storing anime list");
    await db.saveAnimeList(username, animeList);
    let job: PendingJob = {
        username,
        dependencyCount: requiredAnime.length,
        dependsOn: new Set([''].concat(requiredAnime.map(i => `anime-${i}`))),
        jobStatus: JobStatus.Creating,
        created: now,
    };
    await db.addJob(job);

    console.log("Queueing anime");
    const newlyQueued: Array<number> = [];
    let lastQueuePosition = 0;

    let animeQueueStatus: QueueStatus | undefined = undefined;

    await Promise.all(notFound.map(async id => {
        console.log("Increment anime queue length: not found anime", id);
        animeQueueStatus = await db.incrementQueueProperty("anime", "queueLength");
        const result = await db.addAnime({
            id,
            animeStatus: AnimeStatus.Pending,
            queuePosition: animeQueueStatus.queueLength,
            expires: null,
            dependentJobs: new Set([username.toLowerCase()]),
            lastSuccessfulFetch: null,
            failedFetch: null,
        });
        if(!result) {
            // If we can't add the anime, it means it's already added. We should add this job as a dependency instead.
            queued.push(id);
            // Decrease the queue length since we won't be loading this anime after all
            console.log("Increment anime processed items: cancelled not found anime", id);
            await db.incrementQueueProperty("anime", "queueLength", true);
        } else {
            await queue.queueAnime(id);
            console.log("Queued anime", id);
            newlyQueued.push(id);
            lastQueuePosition = Math.max(lastQueuePosition, animeQueueStatus.queueLength);
        }
    }));

    await Promise.all(notQueued.map(async id => {
        console.log("Increment anime queue length: not queued anime", id);
        animeQueueStatus = await db.incrementQueueProperty("anime", "queueLength");
        const result = await db.markAnimePending(id, username.toLowerCase(), animeQueueStatus.queueLength);
        if(!result) {
            // If we can't mark the anime as pending, it means it's already added. We should add this job as a dependency instead.
            queued.push(id);
            // Decrease the queue length since we won't be loading this anime after all
            console.log("Increment anime processed items: cancelled not queued anime", id);
            await db.incrementQueueProperty("anime", "queueLength", true);
        } else {
            await queue.queueAnime(id);
            console.log("Queued anime", id);
            newlyQueued.push(id);
            lastQueuePosition = Math.max(lastQueuePosition, animeQueueStatus.queueLength);
        }
    }));

    await Promise.all(queued.map(async id => {
        const result = await db.addDependentJobToAnime(id, username.toLowerCase());
        if(!result) {
            // If we can't add a job, it means the anime either failed or was successful. Either way, we won't re-request it in this request.
            cached.push(id);
        } else {
            newlyQueued.push(id);
            lastQueuePosition = Math.max(lastQueuePosition, result);
        }
    }));


    const newlyRetrievedAnime = Object.values(await db.getMultipleAnime(newlyQueued, true)).filter(a => a?.expires && a.expires > now) as Array<AnimeDetails>;

    const cachedAnimeIds = cached.concat(newlyRetrievedAnime.map(a => a.id));

    job = await db.updateJobWaiting(username, cachedAnimeIds.map(id => `anime-${id}`), lastQueuePosition);

    if(!animeQueueStatus) {
        animeQueueStatus = await db.getQueueStatus("anime");
    }

    let jobQueueStatus: QueueStatus;
    if(job.dependsOn.size - 1 < 1) {
        await queue.queueProcessing(username);
        console.log("Increment job queue length: all anime already loaded", username);
        jobQueueStatus = await db.incrementQueueProperty("job", "queueLength");
        job = await db.updateJobQueued(username, jobQueueStatus.queueLength);

        console.log("All anime for", username, "already loaded, queued for processing");

    } else {
        jobQueueStatus = await db.getQueueStatus("job");
        
        let jobsToWaitFor = 0;
        if(lastQueuePosition > 0) {
            jobsToWaitFor = lastQueuePosition - (animeQueueStatus.processedItems ?? 0);
            console.log("Job for", username, "requires loading anime. Queue length is", jobsToWaitFor);
        }
    }


    return calculateJobStatus(job, animeQueueStatus, jobQueueStatus);
}

function maxInstant(a: Instant, b: Instant) {
    return a.isAfter(b) ? a : b;
}

function calculateJobStatus(job: PendingJob, animeQueueStatus: QueueStatus, jobQueueStatus: QueueStatus): Contracts.PendingJobStatus {
    const now = Instant.now();

    const created = Instant.ofEpochMilli(job.created);

    const animeQueuePosition = Math.max(0, (job.lastDependencyQueuePosition ?? animeQueueStatus.queueLength ?? 0) - (animeQueueStatus.processedItems ?? 0));
    const jobQueuePosition = Math.max(0, (job.processingQueuePosition ?? jobQueueStatus.queueLength ?? 0) - (jobQueueStatus.processedItems ?? 0));
    const remainingAnime = job.dependsOn.size - 1; // In case the anime queue is out of sync, verify that the queue position is not less than the remaining anime

    const initialised = job.initialised ?
        Instant.ofEpochMilli(job.initialised) :
        maxInstant(created.plusSeconds(10), now.plusSeconds(1));
    
    const queued = job.queued ?
        Instant.ofEpochMilli(job.queued) :
        maxInstant(initialised.plusSeconds(ESTIMATED_QUEUE_LATENCY), now).plusSeconds(Math.max(animeQueuePosition, remainingAnime) * ESTIMATED_SECONDS_PER_ANIME);

    const processingStarted = job.processingStarted ?
        Instant.ofEpochMilli(job.processingStarted) :
        maxInstant(queued.plusSeconds(ESTIMATED_QUEUE_LATENCY), now).plusSeconds(jobQueuePosition * ESTIMATED_SECONDS_PER_JOB);

    const completed = maxInstant(processingStarted.plusSeconds(ESTIMATED_SECONDS_PER_JOB), now.plusSeconds(5));

    const failed = job.failed ? Instant.ofEpochMilli(job.failed) : undefined;

    return {
        now: now.toString(),
        created: created.toString(),
        initialised: initialised.toString(),
        queued: queued.toString(),
        processingStarted: processingStarted.toString(),
        completed: completed.toString(),
        failed: failed?.toString(),
        totalAnime: job.dependencyCount,
        remainingAnime: job.dependsOn.size - 1,
        animeQueuePosition,
        jobQueuePosition,
    };
}

export async function getPendingJobStatus(db: DB, username: string): Promise<Contracts.PendingJobStatus | null> {
    const jobPromise = db.getJob(username, false);
    const animeQueueStatusPromise = db.getQueueStatus("anime");
    const jobQueueStatusPromise = db.getQueueStatus("job");

    const job = await jobPromise;
    const animeQueueStatus = await animeQueueStatusPromise;
    const jobQueueStatus = await jobQueueStatusPromise;

    if(!job) {
        return null;
    }

    return calculateJobStatus(job, animeQueueStatus, jobQueueStatus);
}

export async function getFullStatus(db: DB, username: string): Promise<Contracts.FullStatus> {
    return {
        pending: await getPendingJobStatus(db, username),
        resultsUrl: await db.getCompletedUrl(username),
    };
}

export async function processJob(db: DB, username: string): Promise<void> {
    console.log("Processing job", username);
    const job = await db.updateJobProcessing(username);

    try {
        console.log("Retrieving anime list");
        const animeList = await db.loadAnimeList(username);

        console.log("Retrieving anime");
        const requiredAnime = animeList.map(a => a.node.id);
        const retrievedAnime = await db.bulkGetAnime(requiredAnime, true, false);

        console.log("Crunching");
        const results = await crunchJob(job, animeList, retrievedAnime);

        console.log("Completed job", username);
        await db.addCompleted(results);
        await db.removeJob(username);
        console.log("Increment job processed items: finished processing", username);
        await db.incrementQueueProperty("job", "processedItems");
    } catch (ex) {
        const job = await db.updateJobProcessingRetry(username);
        throw ex;
    }
}

export async function markJobFailed(db: DB, username: string): Promise<void> {
    console.log("Marking job failed", username);
    await db.updateJobProcessingFailed(username);
    console.log("Increment job processed items: failed", username);
    await db.incrementQueueProperty("job", "processedItems");
}