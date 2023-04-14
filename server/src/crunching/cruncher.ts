import { Instant } from "@js-joda/core";
import { IAnimeCharacters, IAnimeFull, IAnimeStats } from "@shineiichijo/marika";
import { UserListAnimeEntry } from "myanimelist-api";
import { Contracts } from "wrongopinions-common";
import { DB } from "../db";
import { over18Poster } from "../fetching/anime";
import { QueueDispatcher } from "../fetching/queueDispatcher";
import { AnimeDetails } from "../model/AnimeDetails";
import { PendingJob } from "../model/PendingJob";
import { getAwardedAwards } from "./awards";
import { calculateBakaScore, getBakaRank } from "./bakaScore";
import { getSeriesDirectionCorrelations } from "./seriesDirection";

export interface AnalysedAnime {
    watched: UserListAnimeEntry;
    details: IAnimeFull;
    stats: IAnimeStats;
    voiceActors: Array<string>;
    poster: string;
    scoreDifference: number;
    scorePopularity: number;
    scoreRank: number;
    tags: Array<string>;
}

export type AnalysedById = {[mal_id: string]: AnalysedAnime};

interface AnimeTitle {
    type: string;
    title: string;
}

export function convertAnimeDetailsToContractAnime(animeDetails: IAnimeFull, poster: string): Contracts.Anime {
    const titles = animeDetails.titles as unknown as Array<AnimeTitle>; // Workaround until https://github.com/LuckyYam/Marika/pull/3 is merged
    // Sometimes titles is not present: https://github.com/jikan-me/jikan/issues/477
    const defaultTitle = titles?.find(t => t.type == "Default")?.title ?? animeDetails.title;
    const englishTitle = titles?.find(t => t.type == "English")?.title ?? animeDetails.title_english;
    const hasDistinctEnglishTitle = defaultTitle?.toLowerCase().replace(/[^a-z]/g, "") != englishTitle?.toLowerCase().replace(/[^a-z]/g, "");
    const isHentai = animeDetails.rating === "Rx - Hentai"; // In case a hentai poster has been hosted, avoid displaying it
    return {
        defaultTitle: defaultTitle ?? "",
        englishTitle: hasDistinctEnglishTitle ? englishTitle : undefined,
        url: animeDetails.url,
        thumbnailUrl: isHentai ? over18Poster : poster,
    };
}

export function convertAnalysedAnimeToContractScoredAnime(analysedAnime: AnalysedAnime): Contracts.ScoredAnime {
    return {
        anime: convertAnimeDetailsToContractAnime(analysedAnime.details, analysedAnime.poster),
        globalScore: analysedAnime.details.score,
        scorePopularity: analysedAnime.scorePopularity,
        userScore: analysedAnime.watched.list_status.score,
    }
}

export function convertListEntryToContractAnime(listEntry: UserListAnimeEntry): Contracts.Anime {
    return {
        defaultTitle: listEntry.node.title,
        url: `https://myanimelist.net/anime/${listEntry.node.id}/`,
        thumbnailUrl: null,
    };
}

export async function crunchJob(job: PendingJob, animeList: Array<UserListAnimeEntry>, retrievedAnime: { [id: number]: AnimeDetails | undefined }): Promise<Contracts.Results> {
    console.log("Analysing anime");
    const analysedAnime: Array<AnalysedAnime> = [];
    const analysedById: { [id: number]: AnalysedAnime } = {};
    for(const watched of animeList) {
        const anime = retrievedAnime[watched.node.id];
        if(!anime?.animeData) {
            continue;
        }
        const { details, stats, voiceActors, poster } = anime.animeData;

        if(!details || !stats || !details.score) {
            continue; // Skip any anime that we can't retrieve details about
        }

        stats.scores.sort((a, b) => b.votes - a.votes);
        const scoreIndex = stats.scores.findIndex(s => s.score == watched.list_status.score);

        const analysed: AnalysedAnime = {
            watched,
            details,
            stats,
            voiceActors,
            poster,
            scoreDifference: watched.list_status.score - details.score,
            scorePopularity: stats.scores[scoreIndex].percentage,
            scoreRank: scoreIndex,
            tags: details.genres.map(g => g.name)
                .concat(details.explicit_genres.map(g => g.name))
                .concat(details.themes.map(t => t.name))
                .concat(details.demographics.map(d => d.name)),
        };
        analysedAnime.push(analysed);
        analysedById[analysed.details.mal_id] = analysed;
    }

    console.log("Crunching scores");
    const tooHighRated = [...analysedAnime].sort((a, b) => b.scoreDifference - a.scoreDifference).filter(a => a.scoreDifference > 2);
    const tooLowRated = [...analysedAnime].sort((a, b) => a.scoreDifference - b.scoreDifference).filter(a => a.scoreDifference < -2);
    const leastPopularScore = [...analysedAnime].sort((a, b) => a.scorePopularity - b.scorePopularity).filter(a => a.scorePopularity < 10);
    console.log("Crunching awards");
    const awarded = getAwardedAwards(analysedAnime, animeList);

    console.log("Crunching baka score");
    const bakaScore = calculateBakaScore(analysedAnime);
    const bakaRank = getBakaRank(bakaScore);

    console.log("Finished crunching");
    return {
        username: job.username,
        requested: Instant.ofEpochMilli(job.created).toString(),
        completed: Instant.now().toString(),
        bakaScore,
        bakaRank,
        mostOverratedShows: tooHighRated.map(convertAnalysedAnimeToContractScoredAnime),
        mostUnderratedShows: tooLowRated.map(convertAnalysedAnimeToContractScoredAnime),
        leastPopularScores: leastPopularScore.map(convertAnalysedAnimeToContractScoredAnime),
        specialAwards: awarded,
        seriesDirectionCorrelations: getSeriesDirectionCorrelations(analysedById),
    };
}

export function getWatchedAnimeByRelationship(animeById: {[mal_id: string]: AnalysedAnime}, relatedTo: AnalysedAnime, relationshipType: string): Array<AnalysedAnime> {
    const relatedIds = relatedTo.details.relations.filter(r => r.relation == relationshipType).flatMap(r => r.entry.map(e => e.mal_id));
    const relatedAnime = relatedIds.map(id => animeById[id]).filter(s => s); // Only include anime that has been watched/rated
    return relatedAnime;
}