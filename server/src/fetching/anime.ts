import { DB } from "../db";
import { QueueDispatcher } from "./queueDispatcher";
import { LocalDate, ZonedDateTime, ZoneOffset } from '@js-joda/core';
import { Anime as MarikaAnime, IAnimeFull, IAnimeStats, IAnimeCharacters } from '@shineiichijo/marika';
import { ratelimit, retry } from '../utils';
import { Mirror } from "../mirror";
import { default as axios } from 'axios';

const marika = {
    anime: new MarikaAnime(),
}

export const over18Poster = "/assets/over18.svg";
axios.defaults.timeout = 10 * 1000; // Avoid pointless waiting when https://github.com/jikan-me/jikan-rest/issues/269 occurs

// Workaround for https://github.com/LuckyYam/Marika/issues/6
function detectJikanErrors<T extends {}>(promise: Promise<T>): Promise<T> {
    return promise.then(response => {
        const cast = response as {error?: string};
        if(!cast || cast['error']) {
            throw new Error(cast?.['error'] ?? "No response from Jikan");
        }
        return response;
    });
}

export async function loadAnime(db: DB, mirror: Mirror, queue: QueueDispatcher, id: number): Promise<void> {
    let details: IAnimeFull;
    let stats: IAnimeStats;
    let characters: IAnimeCharacters;
    console.log("Loading anime", id);
    // Allow one request per second, even if the previous one is still running.
    // We go in this order because stats and characters seem to take longer to load than details.
    await ratelimit(1);
    const statsPromise = retry(() => detectJikanErrors(marika.anime.getAnimeStats(id)), 3, 1);
    await ratelimit(1);
    const charactersPromise = retry(() => detectJikanErrors(marika.anime.getAnimeCharacters(id)), 3, 1);
    await ratelimit(1);
    const detailsPromise = retry(() => detectJikanErrors(marika.anime.getAnimeFullById(id)), 3, 1);
    try {
        details = await detailsPromise;
    } catch (ex) {
        console.error(ex);
        throw new Error(`Failed to get details for anime ${id}`);
    }
    try {
        stats = await statsPromise;
    } catch (ex) {
        console.error(ex);
        throw new Error(`Failed to get stats for anime ${id}`);
    }
    try {
        characters = await charactersPromise;
    } catch (ex) {
        console.error(ex);
        throw new Error(`Failed to get characters for anime ${id}`);
    }

    let expires: LocalDate;

    if(details.status != "Finished Airing") { // If the show is still airing / not yet aired
        expires = LocalDate.now(ZoneOffset.UTC).plusWeeks(1);
    } else if(details.aired.to > ZonedDateTime.now(ZoneOffset.UTC).minusYears(1).toString()) { // If the show finished airing within the past year
        expires = LocalDate.now(ZoneOffset.UTC).plusMonths(1);
    } else { // If the show finished airing more than a year ago
        expires = LocalDate.now(ZoneOffset.UTC).plusMonths(3);
    }

    const isHentai = details.rating === "Rx - Hentai"; // Avoid rehosting hentai posters
    const poster = isHentai ? over18Poster : await mirror.rehostAnimePoster(id, details.images.jpg.image_url);

    // Since some shows can have many characters and many languages, we filter this down before storing it in order to stay within DynamoDB's document size limit
    const voiceActors = characters.data.flatMap(c => c.voice_actors.filter(va => ["Japanese"].includes(va.language)).map(va => va.person.name));

    const animeDetails = await db.markAnimeSuccessful(id, {
        details,
        stats,
        voiceActors,
        poster: poster,
    }, expires);

    console.log("Loaded anime", id, details.title);

    await Promise.all(Array.from(animeDetails.dependentJobs?.values() ?? []).filter(a => a).map(async username => {
        try {
            const pendingJob = await db.removeAnimeFromJob(username, id);
            const remainingAnime = pendingJob.dependsOn.size - 1;
            console.log("Removed anime", id, "from job", username, ",", remainingAnime, "remaining");
            if(remainingAnime < 1) {
                await queue.queueProcessing(username);
                console.log("Increment job queue length: processed all requisite anime", username);
                const jobQueueStatus = await db.incrementQueueProperty("job", "queueLength");
                await db.updateJobQueued(username, jobQueueStatus.queueLength);

                console.log("Queued processing for job", username);
            }
        } catch (ex) {
            console.warn(ex);
        }
    }));

    console.log("Increment anime processed items: processed anime", id);
    await db.incrementQueueProperty('anime', 'processedItems');
}