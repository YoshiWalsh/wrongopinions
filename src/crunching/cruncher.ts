import { IAnime, IAnimeStats } from "@shineiichijo/marika";
import { UserListAnimeEntry, UserListAnimeEntryWatched } from "myanimelist-api";
import { DB } from "../db";
import { QueueDispatcher } from "../fetching/queueDispatcher";
import { getAwardedAwards } from "./awards";

export interface AnalysedAnime {
    watched: UserListAnimeEntryWatched;
    details: IAnime;
    stats: IAnimeStats;
    scoreDifference: number;
    scorePopularity: number;
    tags: Array<string>;
}

export async function processJob(db: DB, queue: QueueDispatcher, username: string): Promise<void> {
    console.log("Finished loading anime for job", username);

    const job = await db.getJob(username, true);
    if(!job) {
        throw new Error(`Attempt to process unknown job '${username}'`);
    }
    const completedRatedAnime = job.animeList.filter(a => a.list_status?.status === "completed" && a.list_status?.score) as Array<UserListAnimeEntryWatched>;

    const now = Date.now();
    const retrievedAnime = await db.getMultipleAnime(completedRatedAnime.map(a => a.node.id), true);

    const analysedAnime: Array<AnalysedAnime> = [];
    for(const watched of completedRatedAnime) {
        const anime = retrievedAnime[watched.node.id];
        if(!anime?.animeData) {
            continue;
        }
        const { details, stats } = anime.animeData;

        if(!details || !stats || !details.score) {
            continue; // Skip any anime that we can't retrieve details about
        } 

        analysedAnime.push({
            watched,
            details,
            stats,
            scoreDifference: watched.list_status.score - details.score,
            scorePopularity: stats.scores.find(s => s.score == watched.list_status.score)!.percentage,
            tags: details.genres.map(g => g.name)
        });
    }

    const tooHighRated = [...analysedAnime].sort((a, b) => b.scoreDifference - a.scoreDifference).filter(a => a.scoreDifference > 2);
    const tooLowRated = [...analysedAnime].sort((a, b) => a.scoreDifference - b.scoreDifference).filter(a => a.scoreDifference < -2);
    const leastPopularScore = [...analysedAnime].sort((a, b) => a.scorePopularity - b.scorePopularity).filter(a => a.scorePopularity < 10);
    const awarded = getAwardedAwards(analysedAnime);

    if(tooHighRated.length > 0) {
        console.log(" ");
        console.log("Worse than you think:");
    }
    for(const current of tooHighRated.slice(0, 5)) {
        console.log(formatShowName(current.details));
        console.log(`Your score: ${current.watched.list_status.score} | Global score: ${current.details.score.toFixed(2)}`);
        console.log("");
    }
    if(tooLowRated.length > 0) {
        console.log(" ");
        console.log("Better than you think:");
    }
    for(const current of tooLowRated.slice(0, 5)) {
        console.log(formatShowName(current.details));
        console.log(`Your score: ${current.watched.list_status.score} | Global score: ${current.details.score.toFixed(2)}`);
        console.log("");
    }
    if(leastPopularScore.length > 0) {
        console.log(" ");
        console.log("Your absolute worst takes:");
    }
    for(const current of leastPopularScore.slice(0, 5)) {
        console.log(formatShowName(current.details));
        console.log(`Your score: ${current.watched.list_status.score} | Global score: ${current.details.score.toFixed(2)} | Only ${current.scorePopularity.toFixed(2)}% of viewers agree with you.`);
        console.log("");
    }
    if(awarded.length > 0) {
        console.log(" ");
        console.log("Extra bad taste awards:");
    }
    for(const current of awarded) {
        console.log(current.name);
        console.log(current.description);
        console.log(current.reason);
        console.log("");
    }
}

function formatShowName(details: IAnime) {
    let output = details.title;
    if(details.title_english) {
        output += ` (${details.title_english})`;
    }
    return output;
}