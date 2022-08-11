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
import { getAwardedAwards } from './awards';
import { Anime } from 'jikants/dist/src/interfaces/genre/Genre';
import { title } from 'process';
import { default as MyAnimeList, UserListAnimeEntry } from 'myanimelist-api';

const MAL_PAGE_SIZE = 1000;

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

type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;
export interface AnalysedAnime {
    watched: Awaited<ReturnType<typeof getUserList>>[0];
    details: AnimeById;
    stats: Stats;
    scoreDifference: number;
    scorePopularity: number;
    tags: Array<string>;
}

async function processUser(username: string) {
    const completedList = await getUserList(username, "completed");
    const ratedList = completedList.filter(a => a.score);
    const animeIds = ratedList.map(a => a.mal_id);
    const animeInfo = await fetchInfoAboutAnime(animeIds);
    const animeNeedingDetails = animeIds.filter(id => !animeInfo[id]?.details);
    const animeNeedingStats = animeIds.filter(id => !animeInfo[id]?.stats);
    const animeNeedingUpdate = [...new Set([...animeNeedingDetails, ...animeNeedingStats])];

    // for(let i = 0; i < animeNeedingUpdate.length; i++) {
    //     console.log(i, "/", animeNeedingUpdate.length);

    //     const id = animeNeedingUpdate[i];
    //     const info = animeInfo[id] = animeInfo[id] || { mal_id: id };

    //     if(!info.details) {
    //         info.details = await JikanTS.Anime.byId(id);
    //     }
    //     if(!info.stats) {
    //         info.stats = await JikanTS.Anime.stats(id);
    //     }

    //     info.updated = Date.now();

    //     await documentClient.send(new PutCommand({
    //         TableName: 'MyAnimeListCache',
    //         Item: info
    //     }));
    // }

    const analysedAnime: Array<AnalysedAnime> = [];
    for(let i = 0; i < ratedList.length; i++) {
        const watched = ratedList[i];
        const {details, stats} = animeInfo[watched.mal_id];

        if(!details || !stats || !details.score) {
            continue; // Skip any anime that we can't retrieve details about
        } 

        analysedAnime.push({
            watched,
            details,
            stats,
            scoreDifference: watched.score - details.score,
            scorePopularity: stats.scores[watched.score].percentage,
            tags: details.genres.map(g => g.name)
        });
    }

    const tooHighRated = [...analysedAnime].sort((a, b) => b.scoreDifference - a.scoreDifference).filter(a => a.scoreDifference > 2);
    const tooLowRated = [...analysedAnime].sort((a, b) => a.scoreDifference - b.scoreDifference).filter(a => a.scoreDifference < -2);
    const leastPopularScore = [...analysedAnime].sort((a, b) => a.scorePopularity - b.scorePopularity).filter(a => a.scorePopularity < 10);
    const awarded = getAwardedAwards(analysedAnime);

    if(tooHighRated.length > 0) {
        console.log(" ");
        console.log("Worse than you think:");
    }
    for(const current of tooHighRated.slice(0, 5)) {
        console.log(formatShowName(current.details));
        console.log(`Your score: ${current.watched.score} | Global score: ${current.details.score.toFixed(2)}`);
        console.log("");
    }
    if(tooLowRated.length > 0) {
        console.log(" ");
        console.log("Better than you think:");
    }
    for(const current of tooLowRated.slice(0, 5)) {
        console.log(formatShowName(current.details));
        console.log(`Your score: ${current.watched.score} | Global score: ${current.details.score.toFixed(2)}`);
        console.log("");
    }
    if(leastPopularScore.length > 0) {
        console.log(" ");
        console.log("Your absolute worst takes:");
    }
    for(const current of leastPopularScore.slice(0, 5)) {
        console.log(formatShowName(current.details));
        console.log(`Your score: ${current.watched.score} | Global score: ${current.details.score.toFixed(2)} | Only ${current.scorePopularity.toFixed(2)}% of viewers agree with you.`);
        console.log("");
    }
    if(awarded.length > 0) {
        console.log(" ");
        console.log("Extra bad taste awards:");
    }
    for(const current of awarded) {
        console.log(current.name);
        console.log(current.description);
        console.log(current.reason);
        console.log("");
    }
}

function formatShowName(details: AnimeById) {
    let output = details.title;
    if(details.title_english) {
        output += ` (${details.title_english})`;
    }
    return output;
}


// processUser("YM_Industries").then(function(res) {
    
// }).catch(function(ex) {
//     console.error(ex);
// });


import { DB } from './db';
import { AnimeStatus } from './model/AnimeDetails';
import { QueueStatus } from './model/QueueStatus';
const db = new DB();
(async function() {

    const mal = new MyAnimeList({
        clientId: process.env.MAL_CLIENT_ID as string,
        clientSecret: process.env.MAL_CLIENT_SECRET as string,
        axiosConfig: {
            headers: {
                'X-MAL-CLIENT-ID': process.env.MAL_CLIENT_ID,
            }
        },
    });

    let animeList: Array<UserListAnimeEntry> = [];
    let offset = 0;
    while(true) {
        const result = await mal.user.listAnime("YM_Industries", {
            limit: MAL_PAGE_SIZE,
            offset,
            fields: 'list_status',
        });
        animeList = animeList.concat(result.data.data);
        if(!result.data.paging.next) {
            break;
        }
        offset += MAL_PAGE_SIZE;
    }
    console.log(animeList);

    const requiredAnime = animeList.filter(a => a.list_status?.status === "completed").map(a => a.node.id);
    console.log(requiredAnime);

    // await db.addAnime({
    //     id: -1,
    //     expires: 0,
    //     animeStatus: AnimeStatus.Pending,
    // });
    // let queueStatus: QueueStatus;
    // let result: boolean;
    // queueStatus = await db.incrementQueueProperty('anime', 'queueLength');
    // result = await db.markAnimePending(-1, 'test', queueStatus.queueLength);
    // if(result) {
    //     console.log("Pending anime at queue position", queueStatus.queueLength);
    // } else {
    //     console.log("Unable to queue");
    //     console.log(await db.incrementQueueProperty('anime', 'queueLength', true));
    // }

    // console.log(await db.addDependentJobToAnime(-1, 'test2'));
    // console.log("done");
})().then(res => {

}).catch(function(ex) {
    console.error(ex);
});