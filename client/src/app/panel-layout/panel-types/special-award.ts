import { Contracts } from "wrongopinions-common";
import { Panel, PossibleSize } from "./panel-type";

export interface AwardProperties {
    icon: string;
    interest: number;
}

const specialAwards: {[name: string]: AwardProperties} = {
    "Small Brain": {
        icon: "/assets/special-award-icons/smallbrain.svg",
        interest: 1,
    },
    "Pretentious": {
        icon: "/assets/special-award-icons/pretentious.svg",
        interest: 1,
    },
    "Meathead": {
        icon: "/assets/special-award-icons/meathead.svg",
        interest: 1,
    },
    "Heartless": {
        icon: "/assets/special-award-icons/heartless.svg",
        interest: 1,
    },
    "Bigamist": {
        icon: "/assets/special-award-icons/bigamist.svg",
        interest: 1,
    },
    "Boring": {
        icon: "/assets/special-award-icons/boring.svg", // TODO
        interest: 1,
    },
    "Prude": {
        icon: "/assets/special-award-icons/prude.svg", // TODO
        interest: 1,
    },
    "Tasteless": {
        icon: "/assets/special-award-icons/tasteless.svg",
        interest: 1,
    },
    "Homophobe": {
        icon: "/assets/special-award-icons/homophobe.svg",
        interest: 1,
    },
    "Objectifier": {
        icon: "/assets/special-award-icons/objectifier.svg",
        interest: 1,
    },
    "Humourless": {
        icon: "/assets/special-award-icons/humourless.svg",
        interest: 1,
    },
    "Sociopath": {
        icon: "/assets/special-award-icons/sociopath.svg", // TODO
        interest: 1,
    },
    "Neo-Luddite": {
        icon: "/assets/special-award-icons/neoluddite.svg",
        interest: 1,
    },
    "Yeagerist": {
        icon: "/assets/special-award-icons/yeagerist.svg",
        interest: 1,
    },
    "Newer = Better?": {
        icon: "/assets/special-award-icons/newerbetter.svg", // TODO
        interest: 1,
    },
    "Only Child": {
        icon: "/assets/special-award-icons/onlychild.svg",
        interest: 1,
    },
    "Hipster": {
        icon: "/assets/special-award-icons/hipster.svg",
        interest: 1,
    },
    "Uncritical": {
        icon: "/assets/special-award-icons/uncritical.svg",
        interest: 1,
    },
    "Jaded": {
        icon: "/assets/special-award-icons/jaded.svg",
        interest: 1,
    },
    "Whippersnapper": {
        icon: "/assets/special-award-icons/whippersnapper.svg",
        interest: 1,
    },
    "Geriatric": {
        icon: "/assets/special-award-icons/geriatric.svg",
        interest: 1,
    },
    "Bin Diver": {
        icon: "/assets/special-award-icons/bindiver.svg",
        interest: 1,
    },
    "Silver Spoon": {
        icon: "/assets/special-award-icons/silverspoon.svg",
        interest: 1,
    },
    "Loner": {
        icon: "/assets/special-award-icons/loner.svg", // TODO
        interest: 1,
    },
    "Judging by the cover": {
        icon: "/assets/special-award-icons/judgingbythecover.svg",
        interest: 1,
    },
    "Hasty": {
        icon: "/assets/special-award-icons/hasty.svg",
        interest: 1,
    },
    "Quitter": {
        icon: "/assets/special-award-icons/quitter.svg",
        interest: 1,
    },
    "Theoretical Weeb": {
        icon: "/assets/special-award-icons/theoreticalweeb.svg",
        interest: 1,
    },
    "Cryostasis": {
        icon: "/assets/special-award-icons/cryostasis.svg",
        interest: 1,
    },
    "Unbalanced": {
        icon: "/assets/special-award-icons/unbalanced.svg",
        interest: 1,
    },
    "Stan": {
        icon: "/assets/special-award-icons/stan.svg",
        interest: 1,
    },
    "Creature of Habit": {
        icon: "/assets/special-award-icons/creatureofhabit.svg",
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

    getAwardProperties(): AwardProperties {
        return specialAwards[this.award.name];
    }
}