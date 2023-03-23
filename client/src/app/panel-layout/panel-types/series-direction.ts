import { longestCommonSubstring } from "string-algorithms";
import { Contracts } from "wrongopinions-common";
import { Panel, PossibleSize } from "./panel-type";

const nonWordCharacters = "[^a-zA-Z0-9]+";
const normaliseRegex = new RegExp(nonWordCharacters, 'g');
export class SeriesDirectionPanel extends Panel {
    seriesDirection: Contracts.SeriesDirectionCorrelation;

    constructor(seriesDirection: Contracts.SeriesDirectionCorrelation) {
        super();

        this.seriesDirection = seriesDirection;
    }

    getPossibleSizes(): Array<PossibleSize> {
        const interest = Math.max(0, -this.seriesDirection.correlationScore ?? 0) * 4;
        if(this.seriesDirection.sequence.length < 4) {
            return [
                {
                    columns: 1,
                    rows: 2,
                    interest: interest,
                    baseInterest: interest
                }
            ];
        }
        return [
            {
                columns: 2,
                rows: 2,
                interest: interest,
                baseInterest: interest
            }
        ];
    }

    getSeriesName(): string {
        const normalisedNames = this.seriesDirection.sequence.map(a => a.anime.defaultTitle
            .replace(normaliseRegex, " ")
            .toLowerCase()
        );
        const longestCommonStringPopularities = {
            [longestCommonSubstring(normalisedNames)]: 1
        };
        // We make the assumption that the first instalment should represent the series name,
        // and compare each other instalment to it.
        for(let i = 1; i < normalisedNames.length; i++) {
            const lcs = longestCommonSubstring([normalisedNames[0], normalisedNames[i]]);

            longestCommonStringPopularities[lcs] = (longestCommonStringPopularities[lcs] ?? 0) + 1;
        }

        const normalisedSeriesName = Object.entries(longestCommonStringPopularities)
            .sort((a, b) => b[1] - a[1])[0][0]
            .replace(/(^ )|( $)/g, "");

        const seriesNameRegex = new RegExp(normalisedSeriesName.replace(/ /g, nonWordCharacters), 'i');

        const seriesNameStylisationPopularities: {[stylisation: string]: number} = {};
        for(const anime of this.seriesDirection.sequence) {
            const title = anime.anime.defaultTitle;
            const stylisedSeriesName = title.match(seriesNameRegex)?.[0];
            if(stylisedSeriesName) {
                seriesNameStylisationPopularities[stylisedSeriesName] = (seriesNameStylisationPopularities[stylisedSeriesName] ?? 0) + 1;
            }
        }

        return Object.entries(seriesNameStylisationPopularities)
            .sort((a, b) => b[1] - a[1])[0][0];
    }

    abbreviateInstalmentName(seriesName: string, instalmentTitle: string) {
        const normalisedSeriesName = seriesName
            .replace(normaliseRegex, " ")
            .toLowerCase();

        const seriesNameRegex = new RegExp(normalisedSeriesName.replace(/ /g, nonWordCharacters), 'i');

        return instalmentTitle.replace(seriesNameRegex, '[...]');
    }
}