import { Contracts } from "wrongopinions-common";
import { Panel, PossibleSize } from "./panel-type";

export interface AwardProperties {
    icon: string;
    interest: number;
}

const lowInterest = 0.8;
const mediumInterest = 1.1;
const highInterest = 1.6;
const veryHighInterest = 2;

const specialAwards: {[name: string]: AwardProperties} = {
    "Small Brain": {
        icon: "/assets/special-award-icons/smallbrain.svg",
        interest: mediumInterest,
    },
    "Pretentious": {
        icon: "/assets/special-award-icons/pretentious.svg",
        interest: mediumInterest,
    },
    "Meathead": {
        icon: "/assets/special-award-icons/meathead.svg",
        interest: mediumInterest,
    },
    "Heartless": {
        icon: "/assets/special-award-icons/heartless.svg",
        interest: lowInterest,
    },
    "Bigamist": {
        icon: "/assets/special-award-icons/bigamist.svg",
        interest: mediumInterest,
    },
    "Boring": {
        icon: "/assets/special-award-icons/boring.svg",
        interest: mediumInterest,
    },
    "Prude": {
        icon: "/assets/special-award-icons/prude.svg",
        interest: lowInterest,
    },
    "Tasteless": {
        icon: "/assets/special-award-icons/tasteless.svg",
        interest: highInterest,
    },
    "Homophobe": {
        icon: "/assets/special-award-icons/homophobe.svg",
        interest: mediumInterest,
    },
    "Objectifier": {
        icon: "/assets/special-award-icons/objectifier.svg",
        interest: highInterest,
    },
    "Humourless": {
        icon: "/assets/special-award-icons/humourless.svg",
        interest: veryHighInterest,
    },
    "Sociopath": {
        icon: "/assets/special-award-icons/sociopath.svg",
        interest: veryHighInterest,
    },
    "Neo-Luddite": {
        icon: "/assets/special-award-icons/neoluddite.svg",
        interest: veryHighInterest,
    },
    "Yeagerist": {
        icon: "/assets/special-award-icons/yeagerist.svg",
        interest: lowInterest,
    },
    "Superficial": {
        icon: "/assets/special-award-icons/superficial.svg",
        interest: highInterest,
    },
    "Only Child": {
        icon: "/assets/special-award-icons/onlychild.svg",
        interest: highInterest,
    },
    "Hipster": {
        icon: "/assets/special-award-icons/hipster.svg",
        interest: lowInterest,
    },
    "Uncritical": {
        icon: "/assets/special-award-icons/uncritical.svg",
        interest: veryHighInterest,
    },
    "Jaded": {
        icon: "/assets/special-award-icons/jaded.svg",
        interest: mediumInterest,
    },
    "Whippersnapper": {
        icon: "/assets/special-award-icons/whippersnapper.svg",
        interest: lowInterest,
    },
    "Geriatric": {
        icon: "/assets/special-award-icons/geriatric.svg",
        interest: veryHighInterest,
    },
    "Bin Diver": {
        icon: "/assets/special-award-icons/bindiver.svg",
        interest: highInterest,
    },
    "Silver Spoon": {
        icon: "/assets/special-award-icons/silverspoon.svg",
        interest: highInterest,
    },
    "Loner": {
        icon: "/assets/special-award-icons/loner.svg",
        interest: veryHighInterest,
    },
    "Judging by the cover": {
        icon: "/assets/special-award-icons/judgingbythecover.svg",
        interest: mediumInterest,
    },
    "Hasty": {
        icon: "/assets/special-award-icons/hasty.svg",
        interest: lowInterest,
    },
    "Quitter": {
        icon: "/assets/special-award-icons/quitter.svg",
        interest: highInterest,
    },
    "Theoretical Weeb": {
        icon: "/assets/special-award-icons/theoreticalweeb.svg",
        interest: mediumInterest,
    },
    "Cryostasis": {
        icon: "/assets/special-award-icons/cryostasis.svg",
        interest: mediumInterest,
    },
    "Unbalanced": {
        icon: "/assets/special-award-icons/unbalanced.svg",
        interest: mediumInterest,
    },
    "Stan": {
        icon: "/assets/special-award-icons/stan.svg",
        interest: mediumInterest,
    },
    "Creature of Habit": {
        icon: "/assets/special-award-icons/creatureofhabit.svg",
        interest: mediumInterest,
    },
    "Aloof": {
        icon: "/assets/special-award-icons/kuudere.svg",
        interest: highInterest,
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
            },
            {
                columns: 2,
                rows: 1,
                interest: interest * 1.01,
                baseInterest: interest
            }
        ];
    }

    getAwardProperties(): AwardProperties {
        return specialAwards[this.award.name];
    }
}