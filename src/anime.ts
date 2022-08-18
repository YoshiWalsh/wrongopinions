import JikanTS from 'jikants';
import { DB } from "./db";
import { QueueDispatcher } from "./queueDispatcher";
import { LocalDate, ZonedDateTime, ZoneOffset } from '@js-joda/core';
import { Anime as MarikaAnime, IAnime, IAnimeStats } from '@shineiichijo/marika';
import { ratelimit } from './utils';

const marika = {
    anime: new MarikaAnime(),
}

export async function loadAnime(db: DB, queue: QueueDispatcher, id: number): Promise<void> {
    let details: IAnime;
    let stats: IAnimeStats;
    await ratelimit(2);
    try {
        details = await marika.anime.getAnimeById(id);
    } catch (ex) {
        console.error(ex);
        throw new Error(`Failed to get details for anime ${id}`);
    }
    try {
        stats = await marika.anime.getAnimeStats(id);
    } catch (ex) {
        console.error(ex);
        throw new Error(`Failed to get stats for anime ${id}`);
    }

    let expires: LocalDate;

    if(details.status != "Finished Airing") { // If the show is still airing / not yet aired
        expires = LocalDate.now(ZoneOffset.UTC).plusWeeks(1);
    } else if(details.aired.to > ZonedDateTime.now(ZoneOffset.UTC).minusYears(1).toString()) { // If the show finished airing within the past year
        expires = LocalDate.now(ZoneOffset.UTC).plusMonths(1);
    } else { // If the show finished airing more than a year ago
        expires = LocalDate.now(ZoneOffset.UTC).plusMonths(3);
    }


    const animeDetails = await db.markAnimeSuccessful(id, {
        details,
        stats,
    }, expires);

    console.log("Loaded", details.title);

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