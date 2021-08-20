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
import { GenreAward, GenreAwards, ShowAward, ShowAwards } from './awards';
import { Anime } from 'jikants/dist/src/interfaces/genre/Genre';
import { title } from 'process';

function delay(t: number) {
    return new Promise(function(resolve) { 
        setTimeout(resolve.bind(null), t);
    });
}

const dynamoClient = new DynamoDBClient({region: 'us-east-1'});
const documentClient = DynamoDBDocumentClient.from(dynamoClient);

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

interface AwardedGenreAward {
    award: GenreAward;
    confidence: number;
};
function getGenreAwards(anime: Array<AnalysedAnime>) {
    const awarded: Array<AwardedGenreAward> = [];
    const genres = [...new Set(GenreAwards.map(a => a.genre))];
    const allScoreDifferences = anime.map(a => a.scoreDifference);
    const allScoreDifferenceMean = jstat.mean(allScoreDifferences);

    for(const genre of genres) {
        const animeWithGenre = anime.filter(a => a.tags.includes(genre));
        const genreScoreDifferences = animeWithGenre.map(a => a.scoreDifference);

        const pValue = jstat.tukeyhsd([allScoreDifferences, genreScoreDifferences])[0][1];
        const meanDifference = jstat.mean(genreScoreDifferences) - allScoreDifferenceMean;
        const confidence = (1-pValue) * 100;

        if(confidence >= 95) {
            const awardsForGenre = GenreAwards.filter(a => a.genre === genre);
            for(const award of awardsForGenre) {
                if(meanDifference * award.direction > 0) {
                    awarded.push({
                        award,
                        confidence
                    });
                }
            }
        }
    }

    return awarded;
}

interface AwardedShowAward {
    award: ShowAward;
    score: number;
    anime: AnalysedAnime;
};
function getShowAwards(anime: Array<AnalysedAnime>) {
    const awarded: Array<AwardedShowAward> = [];

    for(const award of ShowAwards) {
        const show = anime.find(a => a.details.mal_id === award.mal_id);
        const score = show?.watched?.score || NaN;
        if(show && (score - award.score) * award.direction > 0) {
            awarded.push({
                award,
                score,
                anime: show
            });
        }
    }

    return awarded;
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

    for(let i = 0; i < animeNeedingUpdate.length; i++) {
        console.log(i, "/", animeNeedingUpdate.length);

        const id = animeNeedingUpdate[i];
        const info = animeInfo[id] = animeInfo[id] || { mal_id: id };

        if(!info.details) {
            info.details = await JikanTS.Anime.byId(id);
        }
        if(!info.stats) {
            info.stats = await JikanTS.Anime.stats(id);
        }

        info.updated = Date.now();

        await documentClient.send(new PutCommand({
            TableName: 'MyAnimeListCache',
            Item: info
        }));
    }

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
    const awardedGenreAwards = getGenreAwards(analysedAnime);
    const awardedShowAwards = getShowAwards(analysedAnime);


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
    if(awardedGenreAwards.length > 0) {
        console.log(" ");
        console.log("Extra bad taste awards:");
    }
    for(const current of awardedGenreAwards) {
        console.log(current.award.name);
        console.log(current.award.description);
        console.log(`Awarded because you disproportionately ${current.award.direction > 0 ? 'like' : 'dislike'} ${current.award.genre} shows. (${current.confidence.toFixed(1)}% confidence)`);
        console.log("");
    }
    for(const current of awardedShowAwards) {
        console.log(current.award.name);
        console.log(current.award.description);
        console.log(`Awarded because you rated ${formatShowName(current.anime.details)} ${current.award.direction > 0 ? 'above' : 'below'} ${current.award.score}. (Your rating: ${current.score})`);
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


processUser("codythecoder").then(function(res) {
    
}).catch(function(ex) {
    console.error(ex);
});