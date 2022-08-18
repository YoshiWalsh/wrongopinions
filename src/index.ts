require('dotenv').config();

import JikanTS from 'jikants';
import chunk from 'chunk';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { demand } from 'ts-demand';
import * as jstat from 'jstat';
import { AnimeById } from 'jikants/dist/src/interfaces/anime/ById';
import { Stats } from 'jikants/dist/src/interfaces/anime/Stats';
import { AnimeList } from 'jikants/dist/src/interfaces/user/AnimeList';
import { getAwardedAwards } from './crunching/awards';
import { Anime } from 'jikants/dist/src/interfaces/genre/Genre';
import { title } from 'process';
import { default as MyAnimeList, UserListAnimeEntry } from 'myanimelist-api';
import { APIGatewayEvent, SQSEvent, Context, SQSBatchResponse, APIGatewayProxyEvent, APIGatewayProxyResultV2 } from 'aws-lambda';


function delay(t: number) {
    return new Promise(function(resolve) { 
        setTimeout(resolve.bind(null), t);
    });
}

const dynamoClient = new DynamoDBClient({region: 'us-east-1'});
const documentClient = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});

async function getUserList(username: string, type: Parameters<typeof JikanTS.User.animeList>[1]) {
    let list: AnimeList["anime"] = [];
    for(let i = 1; true; i++) {
        const page = await JikanTS.User.animeList(username, type, i);
        if(page?.anime?.length) {
            list = list.concat(page.anime);
        } else {
            break;
        }
        await delay(2);
    }
    return list;
}

async function fetchInfoAboutAnime(ids: Array<number>) {
    const output: {[id: number]: {mal_id: number, details?: AnimeById, stats?: Stats, updated: number}} = {};
    const chunkedIDs = chunk(ids, 100);
    for(const chunkOfIds of chunkedIDs) {
        const retrievedData = await documentClient.send(new BatchGetCommand({
            RequestItems: {
                'MyAnimeListCache': {
                    Keys: chunkOfIds.map(id => ({
                        'mal_id': id
                    })),
                    ProjectionExpression: 'mal_id, details, stats, updated'
                }
            }
        }));
        if(!retrievedData.Responses) {
            continue;
        }
        retrievedData.Responses['MyAnimeListCache'].forEach(r => {
            output[r.mal_id] = r as any;
        });
    }
    return output;
}


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
        // initialiseJob(db, queue, "YM_Industries"),
        initialiseJob(db, queue, "codythecoder"),
    ]);
})().then(res => {

}).catch(function(ex) {
    console.error(ex);
});