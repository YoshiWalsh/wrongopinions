import { Instant } from "@js-joda/core";
import { IAnimeFull, IAnimeStats } from "@shineiichijo/marika";
import { UserListAnimeEntry } from "myanimelist-api";
import { Contracts } from "wrongopinions-common";
import { DB } from "../db";
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

export function convertAnimeDetailsToContractAnime(animeDetails: IAnimeFull): Contracts.Anime {
    const titles = animeDetails.titles as unknown as Array<AnimeTitle>; // Workaround until https://github.com/LuckyYam/Marika/pull/3 is merged
    // Sometimes titles is not present: https://github.com/jikan-me/jikan/issues/477
    const defaultTitle = titles?.find(t => t.type == "Default")?.title ?? animeDetails.title;
    const englishTitle = titles?.find(t => t.type == "English")?.title ?? animeDetails.title_english;
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

export async function crunchJob(job: PendingJob, animeList: Array<UserListAnimeEntry>, retrievedAnime: { [id: number]: AnimeDetails | undefined }): Promise<Contracts.Results> {
    const analysedAnime: Array<AnalysedAnime> = [];
    for(const watched of animeList) {
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

    const bakaScore = calculateBakaScore(analysedAnime);
    const bakaRank = getBakaRank(bakaScore);

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
    };
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