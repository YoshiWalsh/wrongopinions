import { Results } from "./results";

export enum JobStatus {
    Creating = "creating",
    Waiting = "waiting",
    Queued = "queued",
    Processing = "processing",
}

export interface PendingJobStatus {
    status: JobStatus;
    estimatedRemainingSeconds: number;
    created: string;
}

export interface FullStatus {
    results: Results | null;
    pending: PendingJobStatus | null;
}