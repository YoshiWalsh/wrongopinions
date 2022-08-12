import JikanTS from 'jikants';
import { DB } from "./db";
import { QueueDispatcher } from "./queueDispatcher";

export async function loadAnime(db: DB, queue: QueueDispatcher, id: number): Promise<void> {
    const details = await JikanTS.Anime.byId(id);
    if(!details) {
        throw new Error(`Failed to get details for anime ${id}`);
    }
    const stats = await JikanTS.Anime.stats(id);
    if(!stats) {
        throw new Error(`Failed to get stats for anime ${id}`);
    }

    const animeDetails = await db.markAnimeSuccessful(id, {
        details,
        stats,
    });

    await Promise.all(Array.from(animeDetails.dependentJobs?.values() ?? []).map(async username => {
        try {
            const remainingAnime = await db.removeAnimeFromJob(username, id);
            if(remainingAnime < 1) {
                await queue.queueProcessing(username);
            }
        } catch (ex) {
            console.warn(ex);
        }
    }));

    await db.incrementQueueProperty('anime', 'processedItems');
}