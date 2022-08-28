export interface Results {
    username: string;
    generated: string; // ISO8601 timestamp
    
    bakaScore: number;
    bakaRank: AwardedAward;

    mostUnderratedShows: Array<ScoredAnime>;
    mostOverratedShows: Array<ScoredAnime>;
    leastPopularScores: Array<ScoredAnime>;

    specialAwards: Array<AwardedAward>;
}

export interface Anime {
    thumbnailUrl: string;
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