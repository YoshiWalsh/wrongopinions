import MyAnimeList, { UserListAnimeEntry } from "myanimelist-api";
import { DB } from "../db";
import { AnimeDetails, AnimeStatus } from "../model/AnimeDetails";
import { JobStatus, PendingJob } from "../model/PendingJob";
import { Contracts } from 'wrongopinions-common';
import { QueueDispatcher } from "./queueDispatcher";
import { Instant } from "@js-joda/core";
import { crunchJob } from "../crunching/cruncher";
import { QueueStatus } from "../model/QueueStatus";

const MAL_PAGE_SIZE = 1000;
const ESTIMATED_SECONDS_PER_ANIME = 2;
const ESTIMATED_SECONDS_PER_JOB = 5;

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
    while(true) {
        const result = await mal.user.listAnime(username, {
            limit: MAL_PAGE_SIZE,
            offset,
            fields: 'list_status',
        });
        animeList = animeList.concat(result.data.data);
        if(!result.data.paging.next) {
            break;
        }
        offset += MAL_PAGE_SIZE;
    }

    const requiredAnime = animeList.filter(a => a.list_status?.status === "completed" && a.list_status?.score).map(a => a.node.id);
    
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

        if(retrieved.animeStatus === AnimeStatus.Cached && retrieved.expires && retrieved.expires > now) {
            cached.push(id);
            continue;
        }

        if(retrieved.animeStatus === AnimeStatus.Pending) {
            queued.push(id);
            continue
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
            dependentJobs: new Set([username]),
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
        const result = await db.markAnimePending(id, username, animeQueueStatus.queueLength);
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
        const result = await db.addDependentJobToAnime(id, username);
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
    }

    let jobsToWaitFor = 0;
    if(lastQueuePosition > 0) {
        jobsToWaitFor = lastQueuePosition - (animeQueueStatus.processedItems ?? 0);
    }

    console.log("Job for", username, "requires loading anime. Queue length is", jobsToWaitFor);

    return calculateJobStatus(job, animeQueueStatus, jobQueueStatus);
}

function calculateJobStatus(job: PendingJob, animeQueueStatus: QueueStatus, jobQueueStatus: QueueStatus): Contracts.PendingJobStatus {
    const created = Instant.ofEpochMilli(job.created);

    const initialised = job.initialised ?
        Instant.ofEpochMilli(job.initialised) :
        created.plusSeconds(10);
    
    const queued = job.queued ?
        Instant.ofEpochMilli(job.queued) :
        initialised.plusSeconds(((job.lastDependencyQueuePosition ?? animeQueueStatus.queueLength ?? 0) - (animeQueueStatus.processedItems ?? 0)) * ESTIMATED_SECONDS_PER_ANIME);

    const processingStarted = job.processingStarted ?
        Instant.ofEpochMilli(job.processingStarted) :
        queued.plusSeconds(((job.processingQueuePosition ?? jobQueueStatus.queueLength ?? 0) - (jobQueueStatus.processedItems ?? 0)) * ESTIMATED_SECONDS_PER_JOB);

    const completed = processingStarted.plusSeconds(ESTIMATED_SECONDS_PER_JOB);

    const failed = job.failed ? Instant.ofEpochMilli(job.failed) : undefined;

    return {
        now: Instant.now().toString(),
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
        results: await db.getCompleted(username),
    };
}

export async function processJob(db: DB, username: string): Promise<void> {
    console.log("Processing job", username);
    const job = await db.updateJobProcessing(username);

    try {
        console.log("Retrieving anime list");
        const animeList = await db.loadAnimeList(username);

        const completedRatedAnime = animeList.filter(a => a.list_status.status === "completed" && a.list_status.score) as Array<UserListAnimeEntry>;

        console.log("Retrieving anime");
        const retrievedAnime = await db.bulkGetAnime(completedRatedAnime.map(a => a.node.id), true, false);

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