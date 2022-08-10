import { DB } from "./db";
import { AnimeStatus } from "./model/AnimeDetails";
import { JobStatus, PendingJob } from "./model/PendingJob";


export async function initialiseJob(db: DB, username: string, requiredAnime: Array<number>) {
    // TODO: Fetch profile from MAL

    const now = Date.now();
    const retrievedAnime = await db.getMultipleAnime(requiredAnime, false);

    const notFound = [];
    const notQueued = [];
    const queued = [];
    const cached = [];
    for(const id of requiredAnime) {
        const retrieved = retrievedAnime[id];

        if(retrieved === null) {
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
        dependsOn: requiredAnime.map(i => `anime-${i}`),
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
        });
        if(!result) {
            // If we can't add the anime, it means it's already added. We should add this job as a dependency instead.
            queued.push(id);
            // And increase the processedItems count, since we already increased the queue length.
            await db.incrementQueueProperty("anime", "processedItems");
        } else {
            // TODO: Add job to SQS
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
            // TODO: Add job to SQS
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
            // TODO: Add job to SQS
            newlyQueued.push(id);
            lastQueuePosition = Math.max(lastQueuePosition, result);
        }
    }));



    const newlyRetrievedAnime = await db.getMultipleAnime(newlyQueued, true);

    const remainingAnime = await db.updateJobStatusAndRemoveDependencies(username, JobStatus.Processing, Object.keys(newlyRetrievedAnime).map(i => `anime-${i}`), lastQueuePosition);


    if(remainingAnime < 1) {
        // TODO: Add processing job to SQS
        console.log("All anime cached, queued for processing");
        return;
    }

    let jobsToWaitFor = 0;
    if(lastQueuePosition > 0) {
        const queueStatus = await db.getQueueStatus("anime");
        jobsToWaitFor = lastQueuePosition - queueStatus.processedItems;
    }
    console.log(`Job requires loading ${remainingAnime} anime. Based on the current queue, this might take ${jobsToWaitFor * 2} seconds.`);
}