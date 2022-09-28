import { Contracts } from "wrongopinions-common";
import { Panel, PossibleSize } from "./panel-type";

interface ValuedAnime {
    anime: Contracts.ScoredAnime;
    interest: number;
}

interface Layout {
    columns: number;
    rows: number;
    animeCount: number;
}

const layouts = [
    {
        columns: 1,
        rows: 1,
        animeCount: 1
    },
    {
        columns: 1,
        rows: 2,
        animeCount: 3
    },
    {
        columns: 1,
        rows: 3,
        animeCount: 5
    },
    {
        columns: 2,
        rows: 2,
        animeCount: 6
    },
    {
        columns: 2,
        rows: 3,
        animeCount: 10
    },
];

export abstract class AnimeListPanel extends Panel {
    private valuedAnime;

    constructor(anime: Array<Contracts.ScoredAnime>) {
        super();

        this.valuedAnime = anime.map(a => ({
            anime: a,
            interest: this.getAnimeInterest(a),
        }));

        this.valuedAnime.sort((a, b) => b.interest - a.interest);
    }

    protected abstract getAnimeInterest(anime: Contracts.ScoredAnime): number

    getPossibleSizes(): Array<PossibleSize> {
        const totalValues = this.valuedAnime.map(a => a.interest).reduce((acc, cur) => [...acc, acc[acc.length-1] ?? 0 + cur], []);

        return layouts.map<PossibleSize>(l => ({
            columns: l.columns,
            rows: l.rows,
            interest: totalValues[l.animeCount-1],
            baseInterest: totalValues[0],
        }));
    }
}