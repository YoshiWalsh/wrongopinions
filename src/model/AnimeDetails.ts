export enum AnimeStatus {
    Pending = "pending",
    Cached = "cached",
    Failed = "failed",
}

export interface AnimeDetails {
    id: number;
    animeStatus: AnimeStatus;
    expires: number;
    queuePosition?: number;
    dependentJobs?: Array<string>;
}