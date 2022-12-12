import * as jstat from 'jstat';
import { Contracts } from 'wrongopinions-common';
import { AnalysedAnime, AnalysedById, convertAnalysedAnimeToContractScoredAnime, getWatchedAnimeByRelationship } from "./cruncher";

export function getSeriesDirectionCorrelations(analysedById: AnalysedById) {
    const sequences = getAllSequences(analysedById);

    return sequences.filter(s => s.length > 1).map(getSeriesDirectionCorrelation);
}

function getAllSequences(analysedById: AnalysedById) {
    const getChildSequences = (seriesSoFar: Array<AnalysedAnime>): Array<Array<AnalysedAnime>> => {
        const currentAnime = seriesSoFar[seriesSoFar.length-1];
        const sequels = getWatchedAnimeByRelationship(analysedById, currentAnime, "Sequel");
        
        if(sequels.length < 1) {
            return [seriesSoFar];
        } else {
            return sequels.flatMap(s => getChildSequences([...seriesSoFar, s]));
        }
    }


    const startingAnime = Object.values(analysedById).filter(a => getWatchedAnimeByRelationship(analysedById, a, "Prequel").length < 1); // Any anime where the user hasn't watched the prequel
    return startingAnime.flatMap(a => getChildSequences([a]));
}


function getSeriesDirectionCorrelation(sequence: Array<AnalysedAnime>): Contracts.SeriesDirectionCorrelation {
    const userScores = sequence.map(a => a.watched.list_status.score);
    const averageScores = sequence.map(a => a.details.score);
    const correlationCoefficient = jstat.corrcoeff(userScores, averageScores);
    const animeCountScalingFactor = Math.max(sequence.length - 1.5, 0);
    const userMagnitude = jstat.stdev(userScores);
    const averageMagnitude = jstat.stdev(averageScores);
    return {
        sequence: sequence.map(convertAnalysedAnimeToContractScoredAnime),
        correlationCoefficient: correlationCoefficient,
        correlationScore: (correlationCoefficient * Math.pow(animeCountScalingFactor, 1) * Math.pow(userMagnitude * averageMagnitude, 0.5)) || 0,
    };
}