import { IAnimeFull, IAnimeStats } from "@shineiichijo/marika";
import { UserListAnimeEntry } from "myanimelist-api";
import { Contracts } from "wrongopinions-common";
import { DB } from "../db";
import { QueueDispatcher } from "../fetching/queueDispatcher";
import { getAwardedAwards } from "./awards";
import { calculateBakaScore, getBakaRank } from "./bakaScore";
import { getSeriesDirectionCorrelations } from "./seriesDirection";

export interface AnalysedAnime {
    watched: UserListAnimeEntry;
    details: IAnimeFull;
    stats: IAnimeStats;
    scoreDifference: number;
    scorePopularity: number;
    scoreRank: number;
    tags: Array<string>;
}

export type AnalysedById = {[mal_id: string]: AnalysedAnime};

export function convertAnimeDetailsToContractAnime(animeDetails: IAnimeFull): Contracts.Anime {
    const defaultTitle = animeDetails.titles.find(t => t.type == "Default")?.title;
    const englishTitle = animeDetails.titles.find(t => t.type == "English")?.title;
    const hasDistinctEnglishTitle = defaultTitle?.toLowerCase().replace(/[^a-z]/g, "") != englishTitle?.toLowerCase().replace(/[^a-z]/g, "");
    return {
        defaultTitle: defaultTitle ?? "",
        englishTitle: hasDistinctEnglishTitle ? englishTitle : undefined,
        url: animeDetails.url,
        thumbnailUrl: animeDetails.images.jpg.image_url,
    };
}

export function convertAnalysedAnimeToContractScoredAnime(analysedAnime: AnalysedAnime): Contracts.ScoredAnime {
    return {
        anime: convertAnimeDetailsToContractAnime(analysedAnime.details),
        globalScore: analysedAnime.details.score,
        scorePopularity: analysedAnime.scorePopularity,
        userScore: analysedAnime.watched.list_status.score,
    }
}

export function convertListEntryToContractAnime(listEntry: UserListAnimeEntry): Contracts.Anime {
    return {
        defaultTitle: listEntry.node.title,
        thumbnailUrl: listEntry.node.main_picture.medium,
        url: `https://myanimelist.net/anime/${listEntry.node.id}/`,
    };
}

export async function processJob(db: DB, queue: QueueDispatcher, username: string): Promise<void> {
    console.log("Finished loading anime for job", username);

    const job = await db.getJob(username, true);
    if(!job) {
        throw new Error(`Attempt to process unknown job '${username}'`);
    }
    const animeList = await db.loadAnimeList(username);
    const completedRatedAnime = animeList.filter(a => a.list_status.status === "completed" && a.list_status.score) as Array<UserListAnimeEntry>;

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

        stats.scores.sort((a, b) => b.votes - a.votes);
        const scoreIndex = stats.scores.findIndex(s => s.score == watched.list_status.score);

        analysedAnime.push({
            watched,
            details,
            stats,
            scoreDifference: watched.list_status.score - details.score,
            scorePopularity: stats.scores[scoreIndex].percentage,
            scoreRank: scoreIndex,
            tags: details.genres.map(g => g.name)
                .concat(details.explicit_genres.map(g => g.name))
                .concat(details.themes.map(t => t.name))
                .concat(details.demographics.map(d => d.name)),
        });
    }

    
    const analysedById: AnalysedById = analysedAnime.reduce((acc, cur) => ({
        ...acc,
        [cur.details.mal_id]: cur,
    }), {});

    const tooHighRated = [...analysedAnime].sort((a, b) => b.scoreDifference - a.scoreDifference).filter(a => a.scoreDifference > 2);
    const tooLowRated = [...analysedAnime].sort((a, b) => a.scoreDifference - b.scoreDifference).filter(a => a.scoreDifference < -2);
    const leastPopularScore = [...analysedAnime].sort((a, b) => a.scorePopularity - b.scorePopularity).filter(a => a.scorePopularity < 10);
    const awarded = getAwardedAwards(analysedAnime, animeList);

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

    const bakaScore = calculateBakaScore(analysedAnime);
    const bakaRank = getBakaRank(bakaScore);
    console.log("Baka score:", bakaScore);
    console.log(bakaRank.name);
    console.log(bakaRank.description);

    console.log("Series:");
    console.log(getSeriesDirectionCorrelations(analysedById)
        .sort((a, b) => a.correlationScore - b.correlationScore)
        .slice(0, 5)
        .map(s => s.correlationCoefficient + " " + s.sequence.map(a => `${a.anime.defaultTitle} (${a.userScore} / ${a.globalScore})`).join(" -> "))
        .join("\n")
    );
}

function formatShowName(details: IAnimeFull) {
    let output = details.title;
    if(details.title_english) {
        output += ` (${details.title_english})`;
    }
    return output;
}

export function getWatchedAnimeByRelationship(animeById: {[mal_id: string]: AnalysedAnime}, relatedTo: AnalysedAnime, relationshipType: string): Array<AnalysedAnime> {
    const relatedIds = relatedTo.details.relations.filter(r => r.relation == relationshipType).flatMap(r => r.entry.map(e => e.mal_id));
    const relatedAnime = relatedIds.map(id => animeById[id]).filter(s => s); // Only include anime that has been watched/rated
    return relatedAnime;
}