require('dotenv').config();

import { demand } from 'ts-demand';
import { APIGatewayEvent, SQSEvent, Context, SQSBatchResponse, APIGatewayProxyEvent, APIGatewayProxyResultV2 } from 'aws-lambda';
import { Contracts } from 'wrongopinions-common';

// processUser("YM_Industries").then(function(res) {
    
// }).catch(function(ex) {
//     console.error(ex);
// });

function isSQSEvent(event: any): event is SQSEvent {
    return event?.Records;
}

function isAPIGatewayEvent(event: any): event is APIGatewayProxyEvent {
    return event?.requestContext;
}

export async function handler<APIGatewayProxyEvent>(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResultV2>
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
                        await processJob(db, queue, message.username);
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
        return demand<APIGatewayProxyResultV2>({

        });
    }
    throw new Error("Unsupported event");
}


import { DB } from './db';
import { AnimeStatus } from './model/AnimeDetails';
import { QueueStatus } from './model/QueueStatus';
import { QueueDispatcher, QueueMessage, QueueMessageType } from './fetching/queueDispatcher';
import { JobStatus } from './model/PendingJob';
import { loadAnime } from './fetching/anime';
import { initialiseJob } from './fetching/job';
import { processJob } from './crunching/cruncher';
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