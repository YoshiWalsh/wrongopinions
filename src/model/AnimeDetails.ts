export enum AnimeStatus {
    Pending = "pending",
    Cached = "cached",
    Failed = "failed",
}
import { IAnime, IAnimeStats } from '@shineiichijo/marika';

export interface AnimeData {
    details: IAnime;
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