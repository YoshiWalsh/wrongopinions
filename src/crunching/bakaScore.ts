import * as jstat from 'jstat';
import { AwardedAward } from './awards';
import { AnalysedAnime } from './cruncher';

const bakaScoreMaximum = 30000;
const bakaScoreAnimeCountSteepness = 1.03;

export function calculateBakaScore(analysedAnime: Array<AnalysedAnime>): number {
    const numberOfAnime = analysedAnime.length;
    const numberOfAnimeMultiplier = bakaScoreMaximum * (1 - Math.pow(bakaScoreAnimeCountSteepness, -numberOfAnime));

    const averageScoreIndex = jstat.mean(analysedAnime.map(a => a.scoreRank));
    const averageScoreMultiplier = averageScoreIndex / 9;

    return Math.round(numberOfAnimeMultiplier * averageScoreMultiplier);
}


const bakaRanks: Array<{
    minimumScore: number,
    rank: AwardedAward,
}> = [
    {
        minimumScore: 0,
        rank: {
            name: "NPC",
            description: "You know you're meant to pick your own scores, right? MAL isn't a game about trying to match the number.",
            reason: "Awarded for having an unrealistically low baka score.",
        }
    },
    {
        minimumScore: 2000,
        rank: {
            name: "Normie",
            description: "You're a sheep. Have you ever had an original thought in your life?",
            reason: "Awarded for having a low baka score."
        }
    },
    {
        minimumScore: 4000,
        rank: {
            name: "Opinionated",
            description: "You know what you like and you know what you don't.",
            reason: "Awarded for having an ordinary baka score."
        }
    },
    {
        minimumScore: 6000,
        rank: {
            name: "Contrarian",
            description: "Being different doesn’t make you special. Doesn’t it get tiring to be the Devil’s Advocate all the time?",
            reason: "Awarded for having a high baka score."
        }
    },
    {
        minimumScore: 8000,
        rank: {
            name: "Troll",
            description: "Your opinions are so wrong that you can’t possibly be serious.",
            reason: "Awarded for having a comically high baka score."
        }
    },
    {
        minimumScore: 9000,
        rank: {
            name: "IT'S OVER 9000!!!",
            description: "What, 9000!? There's no way that can be right.",
            reason: "Awarded for having a baka score that's over 9000."
        }
    },
    {
        minimumScore: 15000,
        rank: {
            name: "Cheater",
            description: "You must have voted on anime with the specific intention of maximising your baka score. Congratulations, your results are statistically invalid.",
            reason: "Awarded for your votes having no correlation with other votes."
        }
    },
];

export function getBakaRank(bakaScore: number): AwardedAward {
    let attainedRank = bakaRanks[0].rank;
    for(const rank of bakaRanks) {
        if(bakaScore >= rank.minimumScore) {
            attainedRank = rank.rank;
        }
    }
    return attainedRank;
}