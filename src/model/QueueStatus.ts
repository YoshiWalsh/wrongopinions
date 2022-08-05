export interface QueueStatus {
    queueName: string;
    queueLength: number;
    processedItems: number;
}