import { Contracts } from "wrongopinions-common";

export interface PendingJob {
    username: string;
    dependsOn: Set<string>;
    jobStatus: Contracts.JobStatus;
    lastDependencyQueuePosition?: number;
    created: number;
    lastStateChange: number;
    processingQueuePosition?: number;
}