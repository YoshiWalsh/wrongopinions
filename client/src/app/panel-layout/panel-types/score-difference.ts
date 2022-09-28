import { Contracts } from "wrongopinions-common";
import { AnimeListPanel } from "./anime-list";

export class ScoreDifferencePanel extends AnimeListPanel {
    protected override getAnimeInterest(anime: Contracts.ScoredAnime): number {
        return Math.max(Math.min((Math.abs(anime.userScore - anime.globalScore) - 2) / 3, 1), 0);
    }
}