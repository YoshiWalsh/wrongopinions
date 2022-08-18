import * as jstat from 'jstat';
import { AnalysedAnime } from "./cruncher";

type Constructor<T> = { new (): T }

export interface AwardedAward {
    name: string;
    description: string;
    reason: string;
}

export abstract class Award {
    public type: string = "";
    public name: string;
    public description: string;

    constructor(data: {name: string, description: string}) {
        this.name = data.name;
        this.description = data.description;
    }

    abstract getAward(anime: Array<AnalysedAnime>): AwardedAward | null;
}

function notNull<T>(value: T | null): value is T {
    return value !== null;
}

export function getAwardedAwards(anime: Array<AnalysedAnime>): Array<AwardedAward> {
    const awarded: Array<AwardedAward> = [];
    return awards.map(a => a.getAward(anime)).filter(notNull);
}

abstract class BiasConfidenceAward extends Award {
    public type = "";
    public direction: -1 | 1;

    constructor(data: {name: string, description: string, direction: -1 | 1}) {
        super(data);

        this.direction = data.direction;
    }

    shouldAnimeBeSampled(anime: AnalysedAnime): boolean {
        return true; // By default, include all anime
    };

    abstract doesAnimeMatch(anime: AnalysedAnime): boolean;

    abstract getReason(confidence: number): string;

    public getAward(allWatchedAnime: Array<AnalysedAnime>) {
        const sampleAnime = allWatchedAnime.filter(a => this.shouldAnimeBeSampled(a));

        const matchingAnime = sampleAnime.filter(a => this.doesAnimeMatch(a));
        const matchingScoreDifferences = matchingAnime.map(a => a.scoreDifference);

        const nonMatchingAnime = sampleAnime.filter(a => !this.doesAnimeMatch(a));
        const nonMatchingScoreDifferences = nonMatchingAnime.map(a => a.scoreDifference);

        const pValue = jstat.tukeyhsd([nonMatchingScoreDifferences, matchingScoreDifferences])[0][1];
        const meanDifference = jstat.mean(matchingScoreDifferences) - jstat.mean(nonMatchingScoreDifferences);
        const confidence = (1-pValue) * 100;

        if(confidence >= 95 && meanDifference * this.direction > 0) {
            return({
                name: this.name,
                description: this.description,
                reason: this.getReason(confidence)
            });
        }

        return null;
    }
}

class GenreAward extends BiasConfidenceAward {
    public type = "genre";
    private genre: string;

    constructor(data: {name: string, description: string, genre: string, direction: -1 | 1}) {
        super(data);

        this.genre = data.genre;
    }

    doesAnimeMatch(anime: AnalysedAnime) {
        return anime.tags.includes(this.genre);
    };

    getReason(confidence: number): string {
        return `Awarded because you disproportionately ${this.direction > 0 ? 'like' : 'dislike'} ${this.genre} shows. (${confidence.toFixed(1)}% confidence)`;
    };
}

class SubjectAward extends BiasConfidenceAward {
    public type = "subject";
    private genre?: string;
    private subject: string;
    private animeWithSubject: Array<number>;

    constructor(data: {name: string, description: string, subject: string, animeWithSubject: Array<number>, genre?: string, direction: -1 | 1}) {
        super(data);

        this.animeWithSubject = data.animeWithSubject;
        this.subject = data.subject;
        this.genre = data.genre;
    }

    shouldAnimeBeSampled(anime: AnalysedAnime) {
        return !this.genre || anime.tags.includes(this.genre);
    }
    
    doesAnimeMatch(anime: AnalysedAnime) {
        return this.animeWithSubject.includes(anime.details.mal_id);
    };

    getReason(confidence: number): string {
        if(this.genre) {
            return `Awarded because you ${this.direction > 0 ? 'prefer' : 'disfavour'} ${this.genre} shows featuring ${this.subject}. (${confidence.toFixed(1)}% confidence)`;
        } else {
            return `Awarded because you ${this.direction > 0 ? 'prefer' : 'disfavour'} shows featuring ${this.subject}. (${confidence.toFixed(1)}% confidence)`;
        }
    };

    getAward(anime: Array<AnalysedAnime>) {
        return super.getAward(anime);
    }
}

class ShowAward extends Award {
    public type = "show";
    private mal_id: number;
    private score: number;
    private direction: -1 | 1;

    constructor(data: {name: string, description: string, mal_id: number, score: number, direction: -1 | 1}) {
        super(data);

        this.mal_id = data.mal_id;
        this.score = data.score;
        this.direction = data.direction;
    }

    public getAward(anime: Array<AnalysedAnime>) {
        const show = anime.find(a => a.details.mal_id == this.mal_id);
        const score = show?.watched?.list_status.score || NaN;
        if(show && (score - this.score) * this.direction > 0) {
            return({
                name: this.name,
                description: this.description,
                reason: `Awarded because you rated ${show.details.title_japanese} ${this.direction > 0 ? 'highly' : 'poorly'}.`
            });
        }

        return null;
    }
}

class ComparisonAward extends Award {
    public type = "comparison";
    private reason: string;
    private worseShowIds: Array<number>;
    private betterShowIds: Array<number>;

    constructor(data: {name: string, description: string, reason: string, worseShowIds: Array<number>, betterShowIds: Array<number>}) {
        super(data);

        this.reason = data.reason;
        this.worseShowIds = data.worseShowIds;
        this.betterShowIds = data.betterShowIds;
    }

    private getAverageScoreForShows(anime: Array<AnalysedAnime>, showIds: Array<number>): number | null {
        const scores = showIds.map(s => anime.find(a => a.details.mal_id === s)?.watched?.list_status.score).filter(s => s !== null);
        if(scores.length > 0) {
            return jstat.mean(scores);
        } else {
            return null;
        }
    }

    public getAward(anime: Array<AnalysedAnime>) {
        const worseScore = this.getAverageScoreForShows(anime, this.worseShowIds);
        const betterScore = this.getAverageScoreForShows(anime, this.betterShowIds);

        if(worseScore !== null && betterScore !== null && worseScore > betterScore) {
            return {
                name: this.name,
                description: this.description,
                reason: this.reason
            }
        }

        return null;
    }
}

const awards: Array<Award> = [
    new GenreAward({
        genre: 'Dementia',
        direction: -1,
        name: 'Small Brain',
        description: 'You can’t understand what a show is about unless it spells it out for you clearly and literally. Learn to read between the lines.',
    }),
    new GenreAward({
        genre: 'Dementia',
        direction: 1,
        name: 'Pretentious',
        description: 'Your superiority complex is ugly to see. Avant-garde is just a euphemism for elitist incomprehensible bullshit.',
    }),
    new GenreAward({
        genre: 'Psychological',
        direction: -1,
        name: 'Meathead',
        description: 'You don’t like it when people think too much. Introspection is vital for self-improvement, maybe you should try it.',
    }),
    new GenreAward({
        genre: 'Romance',
        direction: -1,
        name: 'Heartless',
        description: 'You’re so lonely that the sight of happy couples makes you feel nothing but bitterness.',
    }),
    new GenreAward({
        genre: 'Harem',
        direction: 1,
        name: 'Greedy',
        description: 'A bigamist like you isn\'t satisfied by disappointing only a single romantic partner. You treat people like Pokémon, trying to collect them all.',
    }),
    new GenreAward({
        genre: 'Slice of Life',
        direction: 1,
        name: 'Boring',
        description: 'Your own life must be really empty if your idea of fun is to watch fictional people do nothing. Get a hobby, or some friends.',
    }),
    new GenreAward({
        genre: 'Ecchi',
        direction: -1,
        name: 'Prude',
        description: 'You’re the sort of person who thinks women shouldn’t expose their ankles in public. If you don’t like fanservice, why are you even watching anime?',
    }),
    new GenreAward({
        genre: 'Hentai',
        direction: 1,
        name: 'Tasteless',
        description: 'When it comes to anime rating, you use your genitals more than your head. You don’t care about quality when it comes to art style, animation, voice acting, or writing. You might claim to be cultured, but with your undiscerning eye you’re just a porn addict.',
    }),
    new GenreAward({
        genre: 'Yaoi',
        direction: -1,
        name: 'Homophobe',
        description: `It's ${(new Date).getFullYear()}, gay people exist, get over it.`,
    }),
    new GenreAward({
        genre: 'Yuri',
        direction: 1,
        name: 'Objectifier',
        description: `Fetishising lesbians doesn't make you progressive.`,
    }),
    new ShowAward({
        mal_id: 33255, // Saiki K
        score: 6,
        direction: -1,
        name: "Humourless",
        description: "The objectively funniest anime couldn’t even make you crack a smile? You are truly joyless."
    }),
    new ShowAward({
        mal_id: 2924, // ef
        score: 6,
        direction: -1,
        name: "Sociopath",
        description: "You must be completely lacking in empathy if even the objectively-best drama anime couldn’t move you."
    }),
    new ShowAward({
        mal_id: 33091, // Planetarian
        score: 6,
        direction: -1,
        name: "Neo-Luddite",
        description: "Your anti-AI prejudice has blinded you to the quality of the objectively-best robot anime."
    }),
    new ComparisonAward({
        name: "Yaegerist",
        description: "You liked Attack on Titan when it was just about yelling and fighting, but not so much once it required you to think.",
        reason: "Awarded for scoring Shingeki no Kyoujin S3/S4P1 lower than S1/S2.",
        worseShowIds: [
            16498, // S1
            25777, // S2
        ],
        betterShowIds: [
            35760, // S3P1
            38524, // S3P2
            40028, // S4P1
        ]
    }),
    new ComparisonAward({
        name: "Newer = Better?",
        description: "Neon Genesis and End of Evangelion are masterpieces, while Rebuild of Evangelion is a disjointed mess. Do you just like the modern visuals?",
        reason: "Awarded for scoring the Rebuilds higher than NGE+EoE.",
        worseShowIds: [
            2759, // 1.0
            3784, // 2.0
            3785, // 3.0
            3786, // 3.0+1.0
        ],
        betterShowIds: [
            30, // NGE
            32, // EoE
        ]
    }),
    new SubjectAward({
        name: "Only Child",
        description: "At least, I hope you are. Otherwise your tastes are concerning.",
        subject: "incest",
        direction: 1,
        animeWithSubject: [
            8769, // My Little Sister Can't Be This Cute
            13659, // My Little Sister Can't Be This Cute 2
            7593, // Kiss x Sis
            38573, // Do You Love Your Mom And Her Two-Hit Multi-Target Attacks?
            39326, // HenSuki
            20785, // Irregular at Magic High School
            40497, // Irregular at Magic High School: Visitor Arc
            11597, // Nisemonogatari
            6987, // Aki Sora
            17777, // Recently, my sister is unusual
            819, // I'm in Love With My Little Sister
            16642, // Ane Koi
            2129, // True Tears
            12143, // Swing Out Sisters
            22069, // Swing Out Sisters (2014)
            7411, // Kanojo x Kanojo x Kanojo
            24641, // Bombastic Sisters
            21829, // Fela Pure
            11879, // Oni Chichi: Re-born
            21097, // Oni Chichi: Rebuild
            10380, // Oni Chichi: Re-birth
            36225, // Baku Ane!!
            40746, // Overflow
            28961, // Idol☆Sister
            33505, // Tsumamigui 3 The Animation
            32667, // Baka na Imouto wo Rikou ni Suru no wa Ore no xx dake na Ken ni Tsuite
            11321, // Nee Summer
            35936, // Imouto Bitch ni Shiboraretai
        ]
    })
];