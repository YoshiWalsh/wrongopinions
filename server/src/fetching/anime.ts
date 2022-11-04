import { DB } from "../db";
import { QueueDispatcher } from "./queueDispatcher";
import { LocalDate, ZonedDateTime, ZoneOffset } from '@js-joda/core';
import { Anime as MarikaAnime, IAnimeFull, IAnimeStats } from '@shineiichijo/marika';
import { ratelimit, retry } from '../utils';
import { Contracts } from "wrongopinions-common";
import { Assets } from "../assets";
import { default as axios } from 'axios';

const marika = {
    anime: new MarikaAnime(),
}

axios.defaults.timeout = 10 * 1000; // Avoid pointless waiting when https://github.com/jikan-me/jikan-rest/issues/269 occurs

export async function loadAnime(db: DB, assets: Assets, queue: QueueDispatcher, id: number): Promise<void> {
    let details: IAnimeFull;
    let stats: IAnimeStats;
    await ratelimit(1 * 2); // We need to make two requests, so we double the ratelimit.
    console.log("Loading anime", id);
    try {
        details = await retry(() => marika.anime.getAnimeFullById(id), 3, 2);
    } catch (ex) {
        console.error(ex);
        throw new Error(`Failed to get details for anime ${id}`);
    }
    try {
        stats = await retry(() => marika.anime.getAnimeStats(id), 3, 2);
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

    const poster = await assets.rehostAnimePoster(id, details.images.jpg.image_url);

    const animeDetails = await db.markAnimeSuccessful(id, {
        details,
        stats,
        poster: poster,
    }, expires);

    console.log("Loaded anime", id, details.title);

    await Promise.all(Array.from(animeDetails.dependentJobs?.values() ?? []).filter(a => a).map(async username => {
        try {
            const remainingAnime = await db.removeAnimeFromJob(username, id);
            console.log("Removed anime", id, "from job", username, ",", remainingAnime, "remaining");
            if(remainingAnime < 1) {
                await queue.queueProcessing(username);
                console.log("Increment job queue length: processed all requisite anime", username);
                const jobQueueStatus = await db.incrementQueueProperty("job", "queueLength");
                await db.updateJobStatusAndSetQueuePosition(username, Contracts.JobStatus.Queued, jobQueueStatus.queueLength);

                console.log("Queued processing for job", username);
            }
        } catch (ex) {
            console.warn(ex);
        }
    }));

    console.log("Increment anime processed items: processed anime", id);
    await db.incrementQueueProperty('anime', 'processedItems');
}