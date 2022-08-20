export enum AnimeStatus {
    Pending = "pending",
    Cached = "cached",
    Failed = "failed",
}
import { IAnimeFull, IAnimeStats } from '@shineiichijo/marika';

export interface AnimeData {
    details: IAnimeFull;
    stats: IAnimeStats;
}

export interface AnimeDetails {
    id: number;
    animeStatus: AnimeStatus;
    expires: number | null;
    queuePosition?: number;
    dependentJobs?: Set<string>;
    animeData?: AnimeData;
}