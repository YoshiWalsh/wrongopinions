import { Results } from "./results";

/**
 * The pending status object contains several timestamps.
 * Timestamps in the past represent times that something happened at.
 * Timestamps in the future represent times that something is expected to happen at.
 */
export interface PendingJobStatus {
    /**
     * The "now" timestamp represents the time on the server, so the client can compensate for time sync issues.
     * Comparing to the "now" timestamp allows the client to reliably tell the current job status.
     */
    now: string;

    /**
     * The time that the job was created.
     */
    created: string;

    /**
     * The time that initialisation for the job completed, with all required anime queued for loading.
     */
    initialised: string;

    /**
     * The time that all required anime details finished loading and the job was added to the processing queue.
     */
    queued: string;

    /**
     * The time that the job started being processed.
     */
    processingStarted: string;

    /**
     * The time that processing was completed and the results were available.
     */
    completed: string;

    /**
     * The time that processing failed.
     * This will only be filled after the retry limit has been reached.
     */
    failed?: string;

    /**
     * Total required anime count
     */
    totalAnime: number;

    /**
     * Anime still waiting to be loaded
     */
    remainingAnime: number;

    /**
     * Position in anime queue
     */
    animeQueuePosition?: number;

    /**
     * Position in job queue
     */
    jobQueuePosition?: number;
}

export interface FullStatus {
    results: Results | null;
    pending: PendingJobStatus | null;
}