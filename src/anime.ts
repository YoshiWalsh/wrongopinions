import JikanTS from 'jikants';
import { DB } from "./db";
import { QueueDispatcher } from "./queueDispatcher";
import { convert, LocalDate, ZoneOffset } from '@js-joda/core';

export async function loadAnime(db: DB, queue: QueueDispatcher, id: number): Promise<void> {
    const details = await JikanTS.Anime.byId(id);
    if(!details) {
        throw new Error(`Failed to get details for anime ${id}`);
    }
    const stats = await JikanTS.Anime.stats(id);
    if(!stats) {
        throw new Error(`Failed to get stats for anime ${id}`);
    }

    let expires: LocalDate;

    if(details.status != "Finished Airing") { // If the show is still airing / not yet aired
        expires = LocalDate.now(ZoneOffset.UTC).plusWeeks(1);
    } else if(details.aired.to > convert(LocalDate.now(ZoneOffset.UTC).minusYears(1)).toDate()) { // If the show finished airing within the past year
        expires = LocalDate.now(ZoneOffset.UTC).plusMonths(1);
    } else { // If the show finished airing more than a year ago
        expires = LocalDate.now(ZoneOffset.UTC).plusMonths(3);
    }


    const animeDetails = await db.markAnimeSuccessful(id, {
        details,
        stats,
    }, expires);

    await Promise.all(Array.from(animeDetails.dependentJobs?.values() ?? []).filter(a => a).map(async username => {
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