export enum AnimeStatus {
    Pending = "pending",
    Cached = "cached",
    Failed = "failed",
}
import { AnimeById } from 'jikants/dist/src/interfaces/anime/ById';
import { Stats } from 'jikants/dist/src/interfaces/anime/Stats';

export interface AnimeData {
    details: AnimeById;
    stats: Stats;
}

export interface AnimeDetails {
    id: number;
    animeStatus: AnimeStatus;
    expires: number | null;
    queuePosition?: number;
    dependentJobs?: Set<string>;
    animeData?: AnimeData;
}