import { SQS } from '@aws-sdk/client-sqs';
import { Context, SQSEvent } from 'aws-lambda';
import { handler } from '..';

export enum QueueMessageType {
    Anime = 'anime',
    Processing = 'processing',
}

const queues: {[type in QueueMessageType]: string | undefined} = {
    'anime': process.env.SQS_ANIME_QUEUE_URL,
    'processing': process.env.SQS_JOB_QUEUE_URL,
};

interface QueueMessageBase {
    type: QueueMessageType;
}

export interface QueueMessageAnime extends QueueMessageBase {
    type: QueueMessageType.Anime;
    id: number;
}

export interface QueueMessageProcessing extends QueueMessageBase {
    type: QueueMessageType.Processing;
    username: string;
}

export type QueueMessage = QueueMessageAnime | QueueMessageProcessing;

export class QueueDispatcher {
    sqs: SQS | null;

    constructor() {
        if(!Object.values(queues).includes(undefined)) {
            this.sqs = new SQS({
                region: process.env.AWS_REGION as string,
            });
        } else {
            this.sqs = null;
        }
    }

    protected async sendMessage(payload: QueueMessage) {
        if(this.sqs) {
            await this.sqs.sendMessage({
                QueueUrl: queues[payload.type],
                MessageBody: JSON.stringify(payload),
            });
        } else {
            // For testing purposes, if there's no queue name we just simulate the queue by calling the handler with a mocked payload
            setTimeout(() => {
                handler<SQSEvent>({
                    Records: [
                        {
                            messageId: "0",
                            messageAttributes: {},
                            attributes: {
                                ApproximateFirstReceiveTimestamp: "",
                                ApproximateReceiveCount: "",
                                SenderId: "",
                                SentTimestamp: "",
                            },
                            awsRegion: process.env.AWS_REGION as string,
                            body: JSON.stringify(payload),
                            md5OfBody: "",
                            eventSource: "",
                            eventSourceARN: "",
                            receiptHandle: ""
                        }
                    ]
                }, {} as Context);
            }, 0);
        }
    }

    public async queueAnime(id: number) {
        await this.sendMessage({
            type: QueueMessageType.Anime,
            id,
        });
    }

    public async queueProcessing(username: string) {
        await this.sendMessage({
            type: QueueMessageType.Processing,
            username,
        });
    }
}