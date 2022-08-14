import MyAnimeList, { UserListAnimeEntry } from "myanimelist-api";
import { DB } from "./db";
import { AnimeDetails, AnimeStatus } from "./model/AnimeDetails";
import { JobStatus, PendingJob } from "./model/PendingJob";
import { QueueDispatcher } from "./queueDispatcher";

const MAL_PAGE_SIZE = 1000;

export async function initialiseJob(db: DB, queue: QueueDispatcher, username: string) {
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

    const requiredAnime = animeList.filter(a => a.list_status?.status === "completed").map(a => a.node.id).slice(0, 1); // TODO: Remove slice

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

    const job: PendingJob = {
        username,
        dependsOn: new Set([''].concat(requiredAnime.map(i => `anime-${i}`))),
        jobStatus: JobStatus.Creating,
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
            // And increase the processedItems count, since we already increased the queue length.
            await db.incrementQueueProperty("anime", "processedItems");
        } else {
            await queue.queueAnime(id);
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
            // And increase the processedItems count, since we already increased the queue length.
            await db.incrementQueueProperty("anime", "processedItems");
        } else {
            await queue.queueAnime(id);
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
            await queue.queueAnime(id);
            newlyQueued.push(id);
            lastQueuePosition = Math.max(lastQueuePosition, result);
        }
    }));


    const newlyRetrievedAnime = Object.values(await db.getMultipleAnime(newlyQueued, true)).filter(a => a?.expires && a.expires > now) as Array<AnimeDetails>;

    const cachedAnimeIds = cached.concat(newlyRetrievedAnime.map(a => a.id));

    const remainingAnime = await db.updateJobStatusAndRemoveDependencies(username, JobStatus.Processing, cachedAnimeIds.map(id => `anime-${id}`), lastQueuePosition);


    if(remainingAnime < 1) {
        await queue.queueProcessing(username);
        console.log("All anime cached, queued for processing");
        return;
    }

    let jobsToWaitFor = 0;
    if(lastQueuePosition > 0) {
        const queueStatus = await db.getQueueStatus("anime");
        jobsToWaitFor = lastQueuePosition - (queueStatus.processedItems ?? 0);
    }
    console.log(`Job requires loading ${remainingAnime} anime. Based on the current queue, this might take ${jobsToWaitFor * 2} seconds.`);
}

export async function processJob(db: DB, queue: QueueDispatcher, username: string): Promise<void> {
    console.log("Finished loading anime for job", username);
}