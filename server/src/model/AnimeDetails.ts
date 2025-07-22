export enum AnimeStatus {
    Pending = "pending",
    Cached = "cached",
    Failed = "failed",
}
import { IAnimeFull, IAnimeStats } from '@shineiichijo/marika';

export interface AnimeData {
    details: IAnimeFull;
    stats: IAnimeStats;
    voiceActors: Array<string>;
    poster: string;
}

export interface AnimeDetails {
    id: number;
    animeStatus: AnimeStatus;
    expires: number | null;
    lastSuccessfulFetch: number | null;
    failedFetch: number | null;
    queuePosition?: number;
    dependentJobs?: Set<string>;
    animeData?: AnimeData;
}

export type AnimeMinimalDetails = Pick<AnimeDetails, "id" | "animeStatus" | "expires">;