import MyAnimeList, { UserListAnimeEntry } from "myanimelist-api";
import { DB } from "../db";
import { AnimeDetails, AnimeStatus } from "../model/AnimeDetails";
import { PendingJob } from "../model/PendingJob";
import { Contracts } from 'wrongopinions-common';
import { QueueDispatcher } from "./queueDispatcher";
import { Instant } from "@js-joda/core";
import { crunchJob } from "../crunching/cruncher";

const MAL_PAGE_SIZE = 1000;

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

    const now = Date.now();
    const retrievedAnime = await db.getMultipleAnime(requiredAnime, false);

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

    await db.saveAnimeList(username, animeList);
    const job: PendingJob = {
        username,
        dependsOn: new Set([''].concat(requiredAnime.map(i => `anime-${i}`))),
        jobStatus: Contracts.JobStatus.Creating,
        created: now,
        lastStateChange: now,
    };
    if(!await db.addJob(job)) {
        throw new Error("Unable to create job"); // TODO: Improve error
    }

    const newlyQueued: Array<number> = [];
    let lastQueuePosition = 0;

    await Promise.all(notFound.map(async id => {
        const queueStatus = await db.incrementQueueProperty("anime", "queueLength");
        const result = await db.addAnime({
            id,
            animeStatus: AnimeStatus.Pending,
            queuePosition: queueStatus.queueLength,
            expires: null,
            dependentJobs: new Set([username]),
        });
        if(!result) {
            // If we can't add the anime, it means it's already added. We should add this job as a dependency instead.
            queued.push(id);
            // Decrease the queue length since we won't be loading this anime after all
            await db.incrementQueueProperty("anime", "queueLength", true);
        } else {
            await queue.queueAnime(id);
            console.log("Queued anime", id);
            newlyQueued.push(id);
            lastQueuePosition = Math.max(lastQueuePosition, queueStatus.queueLength);
        }
    }));

    await Promise.all(notQueued.map(async id => {
        const queueStatus = await db.incrementQueueProperty("anime", "queueLength");
        const result = await db.markAnimePending(id, username, queueStatus.queueLength);
        if(!result) {
            // If we can't mark the anime as pending, it means it's already added. We should add this job as a dependency instead.
            queued.push(id);
            // Decrease the queue length since we won't be loading this anime after all
            await db.incrementQueueProperty("anime", "queueLength", true);
        } else {
            await queue.queueAnime(id);
            console.log("Queued anime", id);
            newlyQueued.push(id);
            lastQueuePosition = Math.max(lastQueuePosition, queueStatus.queueLength);
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

    const remainingAnime = await db.updateJobStatusAndRemoveDependencies(username, Contracts.JobStatus.Waiting, cachedAnimeIds.map(id => `anime-${id}`), lastQueuePosition);


    if(remainingAnime < 1) {
        await queue.queueProcessing(username);
        const jobQueueStatus = await db.incrementQueueProperty("job", "queueLength");
        await db.updateJobStatusAndSetQueuePosition(username, Contracts.JobStatus.Queued, jobQueueStatus.queueLength);

        console.log("All anime for", username, "already loaded, queued for processing");

        return {
            status: Contracts.JobStatus.Queued,
            estimatedRemainingSeconds: (jobQueueStatus.queueLength - jobQueueStatus.processedItems) * 5,
            created: Instant.ofEpochMilli(now).toString(),
        };
    }

    let jobsToWaitFor = 0;
    if(lastQueuePosition > 0) {
        const queueStatus = await db.getQueueStatus("anime");
        jobsToWaitFor = lastQueuePosition - (queueStatus.processedItems ?? 0);
    }

    console.log("Job for", username, "requires loading anime. Queue length is", jobsToWaitFor);

    return {
        status: Contracts.JobStatus.Waiting,
        estimatedRemainingSeconds: jobsToWaitFor * 4,
        created: Instant.ofEpochMilli(now).toString(),
    };
}

export async function getPendingJobStatus(db: DB, username: string): Promise<Contracts.PendingJobStatus | null> {
    const job = await db.getJob(username, false);

    if(!job) {
        return null;
    }

    const jobCreated = Instant.ofEpochMilli(job.created).toString();

    switch(job.jobStatus) {
        case Contracts.JobStatus.Creating:
        case Contracts.JobStatus.Processing:
            return {
                status: job.jobStatus,
                estimatedRemainingSeconds: 10,
                created: jobCreated,
            };
        case Contracts.JobStatus.Waiting:
            const animeQueueStatus = await db.getQueueStatus("anime");
            return {
                status: job.jobStatus,
                estimatedRemainingSeconds: (job.lastDependencyQueuePosition ?? 0 - animeQueueStatus.processedItems ?? 0) * 4,
                created: jobCreated,
            };
        case Contracts.JobStatus.Queued:
            const jobQueueStatus = await db.getQueueStatus("job");
            return {
                status: job.jobStatus,
                estimatedRemainingSeconds: (job.processingQueuePosition ?? 0 - jobQueueStatus.processedItems ?? 0) * 5,
                created: jobCreated,
            };
        default:
            return null;
    }
}

export async function getFullStatus(db: DB, username: string): Promise<Contracts.FullStatus> {
    return {
        pending: await getPendingJobStatus(db, username),
        results: await db.getCompleted(username),
    };
}

export async function processJob(db: DB, username: string): Promise<void> {
    const job = await db.updateJobStatus(username, Contracts.JobStatus.Processing);

    try {
        const animeList = await db.loadAnimeList(username);

        const completedRatedAnime = animeList.filter(a => a.list_status.status === "completed" && a.list_status.score) as Array<UserListAnimeEntry>;

        const retrievedAnime = await db.getMultipleAnime(completedRatedAnime.map(a => a.node.id), true);

        const results = await crunchJob(job, animeList, retrievedAnime);

        await db.addCompleted(results);
        await db.removeJob(username);
        await db.incrementQueueProperty("job", "processedItems");
    } catch (ex) {
        const job = await db.updateJobStatus(username, Contracts.JobStatus.Queued);
        throw ex;
    }
}