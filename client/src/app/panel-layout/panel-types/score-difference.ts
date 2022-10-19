import { Contracts } from "wrongopinions-common";
import { AnimeListPanel } from "./anime-list";

export class ScoreDifferencePanel extends AnimeListPanel {
    protected override getAnimeInterest(anime: Contracts.ScoredAnime): number {
        const direction = Math.sign(anime.userScore - anime.globalScore);
        const maximumPossibleDeviation = direction === 1 ? (10 - anime.globalScore) : (anime.globalScore - 1);
        const absoluteDeviation = Math.abs(anime.userScore - anime.globalScore);
        const deviationRatio = (maximumPossibleDeviation > 0) ? (absoluteDeviation / maximumPossibleDeviation) : 0;
        return (Math.max(absoluteDeviation, 0) * 0.25 + deviationRatio * 1) * 0.3; // Magic numbers found via experimentation
    }
}