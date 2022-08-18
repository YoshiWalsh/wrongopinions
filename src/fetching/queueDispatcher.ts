import { SQS } from '@aws-sdk/client-sqs';
import { Context, SQSEvent } from 'aws-lambda';
import { stringify } from 'querystring';
import { demand } from 'ts-demand';
import { handler } from '..';

export enum QueueMessageType {
    Anime = 'anime',
    Processing = 'processing',
}

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
    queueName: string;

    constructor() {
        this.queueName = process.env.SQS_QUEUE_URL as string;
        if(this.queueName) {
            this.sqs = new SQS({
                region: 'us-east-1',
            });
        } else {
            this.sqs = null;
        }
    }

    protected async sendMessage(payload: QueueMessage) {
        if(this.sqs) {
            this.sqs.sendMessage({
                QueueUrl: this.queueName,
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
                            awsRegion: 'us-east-1',
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