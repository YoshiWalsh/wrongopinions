import { Contracts } from "wrongopinions-common";
import { AnimeListPanel } from "./anime-list";

export class UnpopularScorePanel extends AnimeListPanel {
    protected override getAnimeInterest(anime: Contracts.ScoredAnime): number {
        return 10 / (anime.scorePopularity + 2);
    }
}