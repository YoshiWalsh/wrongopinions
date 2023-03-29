export enum AnimeStatus {
    Pending = "pending",
    Cached = "cached",
    Failed = "failed",
}
import { IAnimeCharacters, IAnimeFull, IAnimeStats } from '@shineiichijo/marika';

export interface AnimeData {
    details: IAnimeFull;
    stats: IAnimeStats;
    characters: IAnimeCharacters;
    poster: string;
}

export interface AnimeDetails {
    id: number;
    animeStatus: AnimeStatus;
    expires: number | null;
    queuePosition?: number;
    dependentJobs?: Set<string>;
    animeData?: AnimeData;
}

export type AnimeMinimalDetails = Pick<AnimeDetails, "id" | "animeStatus" | "expires">;