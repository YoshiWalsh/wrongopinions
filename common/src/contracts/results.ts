export interface Results {
    username: string;
    requested: string; // ISO8601 timestamp
    completed: string; // ISO8601 timestamp
    animeMissingData: Array<UnfetchedAnime>;
    animeWithOutdatedData: Array<UnfetchedAnime>;
    oldestData: string | null; // ISO8601 timestamp
    
    bakaScore: number;
    bakaRank: AwardedAward;

    mostUnderratedShows: Array<ScoredAnime>;
    mostOverratedShows: Array<ScoredAnime>;
    leastPopularScores: Array<ScoredAnime>;

    specialAwards: Array<AwardedAward>;

    seriesDirectionCorrelations: Array<SeriesDirectionCorrelation>;
}

export interface UnfetchedAnime {
    id: number,
    title: string,
}

export interface Anime {
    thumbnailUrl: string | null;
    defaultTitle: string;
    englishTitle?: string;
    url: string;
}

export interface ScoredAnime {
    anime: Anime;
    userScore: number;
    globalScore: number;
    scorePopularity: number;
}

export interface AwardedAward {
    name: string;
    description: string;
    reason: string;
    contributingAnime: Array<Anime>;
}

export interface SeriesDirectionCorrelation {
    sequence: Array<ScoredAnime>;
    correlationCoefficient: number;
    correlationScore: number;
}