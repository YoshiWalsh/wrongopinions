import * as jstat from 'jstat';
import { Contracts } from "wrongopinions-common";
import { AnalysedAnime } from './cruncher';

const bakaScoreScalingFactor = 6000;

export function calculateBakaScore(analysedAnime: Array<AnalysedAnime>): number {
    const numberOfAnime = analysedAnime.length;
    const numberOfAnimeMultiplier = Math.log(numberOfAnime+1) * bakaScoreScalingFactor;

    const averageScoreIndex = jstat.mean(analysedAnime.map(a => a.scoreRank));
    const averageScoreMultiplier = averageScoreIndex / 9;

    return !isNaN(averageScoreMultiplier) ? Math.round(numberOfAnimeMultiplier * averageScoreMultiplier) : 0;
}


const bakaRanks: Array<{
    minimumScore: number,
    rank: Contracts.AwardedAward,
}> = [
    {
        minimumScore: 0,
        rank: {
            name: "Incorporeal",
            description: "You haven't rated any shows. We can't judge your taste if you don't have any.",
            reason: "Awarded for having a baka score of zero.",
            contributingAnime: [],
        }
    },
    {
        minimumScore: 1,
        rank: {
            name: "NPC",
            description: "You know you're meant to pick your own scores, right? MAL isn't a game about trying to match the number.",
            reason: "Awarded for having an unrealistically low baka score.",
            contributingAnime: [],
        }
    },
    {
        minimumScore: 3500,
        rank: {
            name: "Normie",
            description: "You're a sheep. Have you ever had an original thought in your life?",
            reason: "Awarded for having a low baka score.",
            contributingAnime: [],
        }
    },
    {
        minimumScore: 4000,
        rank: {
            name: "Opinionated",
            description: "You know what you like and you know what you don't.",
            reason: "Awarded for having an ordinary baka score.",
            contributingAnime: [],
        }
    },
    {
        minimumScore: 5500,
        rank: {
            name: "Contrarian",
            description: "Being different doesn’t make you special. Doesn’t it get tiring to be the Devil’s Advocate all the time?",
            reason: "Awarded for having a high baka score.",
            contributingAnime: [],
        }
    },
    {
        minimumScore: 7500,
        rank: {
            name: "Troll",
            description: "Your opinions are so wrong that you can’t possibly be serious.",
            reason: "Awarded for having a comically high baka score.",
            contributingAnime: [],
        }
    },
    {
        minimumScore: 9000,
        rank: {
            name: "IT'S OVER 9000!!!",
            description: "What, 9000!? There's no way that can be right.",
            reason: "Awarded for having a baka score that's over 9000.",
            contributingAnime: [],
        }
    },
    {
        minimumScore: 15000,
        rank: {
            name: "Cheater",
            description: "Intentionally aiming for the highest baka score? Congratulations, your results are statistically invalid.",
            reason: "Awarded for your votes having no correlation with other votes.",
            contributingAnime: [],
        }
    },
];

export function getBakaRank(bakaScore: number): Contracts.AwardedAward {
    let attainedRank = bakaRanks[0].rank;
    for(const rank of bakaRanks) {
        if(bakaScore >= rank.minimumScore) {
            attainedRank = rank.rank;
        }
    }
    return attainedRank;
}