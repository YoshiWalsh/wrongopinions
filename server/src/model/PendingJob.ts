import { Contracts } from "wrongopinions-common";

export enum JobStatus {
    Creating = "creating",
    Waiting = "waiting",
    Queued = "queued",
    Processing = "processing",
}
export interface PendingJob {
    username: string;
    dependencyCount: number;
    dependsOn: Set<string>;
    jobStatus: JobStatus;
    lastDependencyQueuePosition?: number;
    processingQueuePosition?: number;
    created: number;
    initialised?: number;
    queued?: number;
    processingStarted?: number;
    failed?: number;
}