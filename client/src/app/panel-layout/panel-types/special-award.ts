import { Contracts } from "wrongopinions-common";
import { Panel, PossibleSize } from "./panel-type";

export interface AwardProperties {
    icon: string;
    interest: number;
}

const specialAwards: {[name: string]: AwardProperties} = {
    "Small Brain": {
        icon: "Small Brain.svg",
        interest: 1,
    },
    "Pretentious": {
        icon: "Pretentious.svg",
        interest: 1,
    },
    "Meathead": {
        icon: "Meathead.svg",
        interest: 1,
    },
    "Heartless": {
        icon: "Heartless.svg",
        interest: 1,
    },
    "Greedy": {
        icon: "Greedy.svg",
        interest: 1,
    },
    "Boring": {
        icon: "Boring.svg",
        interest: 1,
    },
    "Prude": {
        icon: "Prude.svg",
        interest: 1,
    },
    "Tasteless": {
        icon: "Tasteless.svg",
        interest: 1,
    },
    "Homophobe": {
        icon: "Homophobe.svg",
        interest: 1,
    },
    "Objectifier": {
        icon: "Objectifier.svg",
        interest: 1,
    },
    "Humourless": {
        icon: "Humourless.svg",
        interest: 1,
    },
    "Sociopath": {
        icon: "Sociopath.svg",
        interest: 1,
    },
    "Neo-Luddite": {
        icon: "Neo-Luddite.svg",
        interest: 1,
    },
    "Yaegerist": {
        icon: "Yaegerist.svg",
        interest: 1,
    },
    "Newer = Better?": {
        icon: "Newer = Better?.svg",
        interest: 1,
    },
    "Only Child": {
        icon: "Only Child.svg",
        interest: 1,
    },
    "Hipster": {
        icon: "Hipster.svg",
        interest: 1,
    },
    "Uncritical": {
        icon: "Uncritical.svg",
        interest: 1,
    },
    "Jaded": {
        icon: "Jaded.svg",
        interest: 1,
    },
    "Whippersnapper": {
        icon: "Whippersnapper.svg",
        interest: 1,
    },
    "Geriatric": {
        icon: "Geriatric.svg",
        interest: 1,
    },
    "Bin Diver": {
        icon: "Bin Diver.svg",
        interest: 1,
    },
    "Silver Spoon": {
        icon: "Silver Spoon.svg",
        interest: 1,
    },
    "Loner": {
        icon: "Loner.svg",
        interest: 1,
    },
    "Judging by the cover": {
        icon: "Judging by the cover.svg",
        interest: 1,
    },
    "Hasty": {
        icon: "Hasty.svg",
        interest: 1,
    },
    "Quitter": {
        icon: "Quitter.svg",
        interest: 1,
    },
    "Theoretical Weeb": {
        icon: "Theoretical Weeb.svg",
        interest: 1,
    },
    "Cryostatis": {
        icon: "Cryostatis.svg",
        interest: 1,
    },
    "Unbalanced": {
        icon: "Unbalanced.svg",
        interest: 1,
    },
    "Stan": {
        icon: "Stan.svg",
        interest: 1,
    },
    "Creature of Habit": {
        icon: "Creature of Habit.svg",
        interest: 1,
    },    
};

export class SpecialAwardPanel extends Panel {
    award: Contracts.AwardedAward;

    constructor(award: Contracts.AwardedAward) {
        super();

        this.award = award;
    }

    getPossibleSizes(): Array<PossibleSize> {
        const interest = specialAwards[this.award.name]?.interest ?? 0;
        return [
            {
                columns: 1,
                rows: 1,
                interest: interest,
                baseInterest: interest
            }
        ];
    }
}