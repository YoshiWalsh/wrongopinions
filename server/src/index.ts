require('dotenv').config();

import { demand } from 'ts-demand';
import { SQSEvent, Context, SQSBatchResponse, APIGatewayProxyEventV2WithRequestContext, APIGatewayEventRequestContextV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DB } from './db';
import { QueueDispatcher, QueueMessage, QueueMessageType } from './fetching/queueDispatcher';
import { loadAnime } from './fetching/anime';
import { initialiseJob, getPendingJobStatus, getFullStatus, processJob, markJobFailed } from './fetching/job';
import { convertExceptionToResponse } from './error';
import { Contracts } from 'wrongopinions-common';
import { Mirror } from './mirror';

const db = new DB();
const queue = new QueueDispatcher();
const mirror = new Mirror();

function isSQSEvent(event: any): event is SQSEvent {
    return event?.Records;
}

type APIGatewayProxyEventV2WithoutAuthorization = APIGatewayProxyEventV2WithRequestContext<APIGatewayEventRequestContextV2>;

function isAPIGatewayEvent(event: any): event is APIGatewayProxyEventV2WithoutAuthorization {
    return event?.requestContext;
}

export async function handler<APIGatewayProxyEventV2WithoutAuthorization>(event: APIGatewayProxyEventV2WithoutAuthorization, context: Context): Promise<APIGatewayProxyResultV2>
export async function handler<SQSEvent>(event: SQSEvent, context: Context): Promise<SQSBatchResponse>
export async function handler<T>(event: T, context: Context): Promise<any> {
    console.log("Handling request", JSON.stringify({ event, context }));

    if(isSQSEvent(event)) {
        const results = await Promise.all(event.Records.map(async item => {
            try {
                const message = JSON.parse(item.body) as QueueMessage;
                
                switch(message.type) {
                    case QueueMessageType.Anime:
                        await loadAnime(db, mirror, queue, message.id);
                        break;
                    case QueueMessageType.Processing:
                        if(item.eventSourceARN === process.env.SQS_FAILED_QUEUE_ARN) {
                            await markJobFailed(db, message.username);
                        } else {
                            await processJob(db, message.username);
                        }
                        break;
                }
            } catch (ex) {
                console.error(ex);
                return item.messageId;
            }
            return null;
        }));

        const failedItems = results.filter(id => id !== null) as Array<string>; // Remove null records (successfully processed)
        const response = demand<SQSBatchResponse>({
            batchItemFailures: failedItems.map(i => ({ itemIdentifier: i })),
        });
        console.log("Responding", JSON.stringify(response));
        return response;
    }
    if(isAPIGatewayEvent(event)) {
        try {
            const responsePayload = await (async () => {
                switch(event.routeKey) {
                    case 'GET /opinions/{username}':
                        return await getFullStatus(db, event.pathParameters!['username'] as string);
                    case 'GET /opinions/{username}/pending':
                        return await getPendingJobStatus(db, event.pathParameters!['username'] as string);
                    case 'POST /opinions/{username}':
                        return await initialiseJob(db, queue, event.pathParameters!['username'] as string);
                }
            })();
            const responseInEnvelope = demand<Contracts.SuccessResponse<typeof responsePayload>>({
                data: responsePayload,
            });
            return demand<APIGatewayProxyResultV2>({
                statusCode: 200,
                isBase64Encoded: false,
                body: JSON.stringify(responseInEnvelope),
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        } catch (ex) {
            const errorObject = convertExceptionToResponse(ex);
            console.error(ex);
            return demand<APIGatewayProxyResultV2>({
                statusCode: errorObject.code,
                isBase64Encoded: false,
                body: JSON.stringify(errorObject),
            });
        }
    }
    throw new Error("Unsupported event");
}