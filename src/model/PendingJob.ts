export enum JobStatus {
    Creating = "creating",
    Waiting = "waiting",
    Queued = "queued",
    Processing = "processing",
}

export interface PendingJob {
    username: string;
    dependsOn: Array<string>;
    jobStatus: JobStatus;
    lastDependencyQueuePosition?: number;
    lastStateChange: number;
    processingQueuePosition?: number;
}