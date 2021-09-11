import * as jstat from 'jstat';
import { AnalysedAnime } from ".";

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

class GenreAward extends Award {
    public type = "genre";
    private genre: string;
    private direction: -1 | 1;
    private static allScoreDifferences?: Array<number>;
    private static allScoreDifferenceMean?: number;

    constructor(data: {name: string, description: string, genre: string, direction: -1 | 1}) {
        super(data);

        this.genre = data.genre;
        this.direction = data.direction;
    }

    public getAward(anime: Array<AnalysedAnime>) {
        const allScoreDifferences = anime.map(a => a.scoreDifference);
        const allScoreDifferenceMean = jstat.mean(allScoreDifferences);

        const animeWithGenre = anime.filter(a => a.tags.includes(this.genre));
        const genreScoreDifferences = animeWithGenre.map(a => a.scoreDifference);

        const pValue = jstat.tukeyhsd([allScoreDifferences, genreScoreDifferences])[0][1];
        const meanDifference = jstat.mean(genreScoreDifferences) - allScoreDifferenceMean;
        const confidence = (1-pValue) * 100;

        if(confidence >= 95 && meanDifference * this.direction > 0) {
            return({
                name: this.name,
                description: this.description,
                reason: `Awarded because you disproportionately ${this.direction > 0 ? 'like' : 'dislike'} ${this.genre} shows. (${confidence.toFixed(1)}% confidence)`
            });
        }

        return null;
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
        const score = show?.watched?.score || NaN;
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
        const scores = showIds.map(s => anime.find(a => a.details.mal_id === s)?.watched?.score).filter(s => s !== null);
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
];