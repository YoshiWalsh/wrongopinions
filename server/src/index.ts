require('dotenv').config();

import { demand } from 'ts-demand';
import { SQSEvent, Context, SQSBatchResponse, APIGatewayProxyEventV2WithRequestContext, APIGatewayEventRequestContextV2, APIGatewayProxyResultV2 } from 'aws-lambda';

// processUser("YM_Industries").then(function(res) {
    
// }).catch(function(ex) {
//     console.error(ex);
// });

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
    const queue = new QueueDispatcher();
    const db = new DB();

    if(isSQSEvent(event)) {
        const results = await Promise.all(event.Records.map(async item => {
            try {
                const message = JSON.parse(item.body) as QueueMessage;
                
                switch(message.type) {
                    case QueueMessageType.Anime:
                        await loadAnime(db, queue, message.id);
                        break;
                    case QueueMessageType.Processing:
                        await processJob(db, message.username);
                        break;
                }
            } catch (ex) {
                console.error(ex);
                return item.messageId;
            }
            return null;
        }));

        const failedItems = results.filter(id => id !== null) as Array<string>; // Remove null records (successfully processed)
        return demand<SQSBatchResponse>({
            batchItemFailures: failedItems.map(i => ({ itemIdentifier: i })),
        });
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
            return demand<APIGatewayProxyResultV2>({
                statusCode: 200,
                isBase64Encoded: false,
                body: JSON.stringify(responsePayload),
            });
        } catch (ex) {
            const errorObject = convertExceptionToResponse(ex);
            return demand<APIGatewayProxyResultV2>({
                statusCode: errorObject.code,
                isBase64Encoded: false,
                body: JSON.stringify(errorObject),
            });
        }
    }
    throw new Error("Unsupported event");
}


import { DB } from './db';
import { QueueDispatcher, QueueMessage, QueueMessageType } from './fetching/queueDispatcher';
import { loadAnime } from './fetching/anime';
import { initialiseJob, getPendingJobStatus, getFullStatus, processJob } from './fetching/job';
import { convertExceptionToResponse } from './error';
const db = new DB();
const queue = new QueueDispatcher();
(async function() {
    await Promise.all([
        initialiseJob(db, queue, "YM_Industries"),
        // initialiseJob(db, queue, "codythecoder"),
        // initialiseJob(db, queue, "Voivodian"),
    ]);
})().then(res => {

}).catch(function(ex) {
    console.error(ex);
});