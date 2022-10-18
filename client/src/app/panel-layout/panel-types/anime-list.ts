import { Contracts } from "wrongopinions-common";
import { Panel, PossibleSize } from "./panel-type";

export interface ValuedAnime {
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
    valuedAnime: Array<ValuedAnime>;

    constructor(anime: Array<Contracts.ScoredAnime>) {
        super();

        this.valuedAnime = anime.map(a => ({
            anime: a,
            interest: this.getAnimeInterest(a),
        }));

        this.valuedAnime.sort((a, b) => b.interest - a.interest);
    }

    /*
        There's a lot of overlap between the UnpopularScore and ScoreDifference panels. This
        makes a boring report card, because the same bad opinions are represented twice.

        This function makes each AnimeListPanel fight for exclusive rights to display an anime.
        It's kind of like the childhood friend and the transfer student fighting over senpai.
    */
    static tournamentArc(panels: Array<AnimeListPanel>): void {
        const ownershipRights: {[url: string]: { panel: AnimeListPanel, interest: number }} = {};

        for(const panel of panels) {
            for(const valuedAnime of panel.valuedAnime) {
                const url = valuedAnime.anime.anime.url;
                const existingInterest = ownershipRights[url]?.interest ?? 0;
                const currentInterest = valuedAnime.interest;
                if(currentInterest > existingInterest) {
                    ownershipRights[url] = {
                        panel: panel,
                        interest: currentInterest,
                    };
                }
            }
        }

        for(const panel of panels) {
            panel.valuedAnime = panel.valuedAnime.filter(a => ownershipRights[a.anime.anime.url].panel === panel);
        }
    }

    protected abstract getAnimeInterest(anime: Contracts.ScoredAnime): number

    getPossibleSizes(): Array<PossibleSize> {
        const totalValues = this.valuedAnime.map(a => a.interest).reduce<Array<number>>((acc, cur) => [...acc, (acc[acc.length-1] ?? 0) + cur], []);

        return layouts.map<PossibleSize>(l => ({
            columns: l.columns,
            rows: l.rows,
            interest: totalValues[Math.min(l.animeCount, this.valuedAnime.length)-1] ?? 0,
            baseInterest: totalValues[0],
        }));
    }

    getAnimeCountForSize(size: PossibleSize): number {
        const matchingLayout = layouts.find(l => l.columns === size.columns && l.rows === size.rows);
        if(matchingLayout) {
            return matchingLayout.animeCount;
        }
        throw new Error("No matching layout found!");
    }
}