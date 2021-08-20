export type GenreAward = {
    genre: string;
    direction: -1 | 1;
    name: string;
    description: string;
}

export const GenreAwards: Array<GenreAward> = [
    {
        genre: 'Dementia',
        direction: -1,
        name: 'Small Brain',
        description: 'You can’t understand what a show is about unless it spells it out for you clearly and literally. Learn to read between the lines.',
    },
    {
        genre: 'Dementia',
        direction: 1,
        name: 'Pretentious',
        description: 'Your superiority complex is ugly to see. Avant-garde is just a euphemism for elitist incomprehensible bullshit.',
    },
    {
        genre: 'Psychological',
        direction: -1,
        name: 'Meathead',
        description: 'You don’t like it when people think too much. Introspection is vital for self-improvement, maybe you should try it.',
    },
    {
        genre: 'Romance',
        direction: -1,
        name: 'Heartless',
        description: 'You’re so lonely that the sight of happy couples makes you feel nothing but bitterness.',
    },
    {
        genre: 'Harem',
        direction: 1,
        name: 'Greedy',
        description: 'A bigamist like you isn\'t satisfied by disappointing only a single romantic partner. You treat people like Pokémon, trying to collect them all.',
    },
    {
        genre: 'Slice of Life',
        direction: 1,
        name: 'Boring',
        description: 'Your own life must be really empty if your idea of fun is to watch fictional people do nothing. Get a hobby, or some friends.',
    },
    {
        genre: 'Ecchi',
        direction: -1,
        name: 'Prude',
        description: 'You’re the sort of person who thinks women shouldn’t expose their ankles in public. If you don’t like fanservice, why are you even watching anime?',
    },
    {
        genre: 'Hentai',
        direction: 1,
        name: 'Tasteless',
        description: 'When it comes to anime rating, you use your genitals more than your head. You don’t care about quality when it comes to art style, animation, voice acting, or writing. You might claim to be cultured, but with your undiscerning eye you’re just a porn addict.',
    },
    {
        genre: 'Yaoi',
        direction: -1,
        name: 'Homophobe',
        description: `It's ${(new Date).getFullYear()}, gay people exist, get over it.`,
    },
    {
        genre: 'Yuri',
        direction: 1,
        name: 'Objectifier',
        description: `Fetishising lesbians doesn't make you progressive.`,
    },
];

export type ShowAward = {
    mal_id: number;
    score: number;
    direction: -1 | 1;
    name: string;
    description: string;
}

// These awards are fair and objective.
export const ShowAwards: Array<ShowAward> = [
    {
        mal_id: 33255, // Saiki K
        score: 6,
        direction: -1,
        name: "Humourless",
        description: "The objectively funniest anime couldn’t even make you crack a smile? You are truly joyless."
    },
    {
        mal_id: 2924, // ef
        score: 6,
        direction: -1,
        name: "Sociopath",
        description: "You must be completely lacking in empathy if even the objectively-best drama anime couldn’t move you."
    },
    {
        mal_id: 33091, // Planetarian
        score: 6,
        direction: -1,
        name: "Neo-Luddite",
        description: "Your anti-AI prejudice has blinded you to the quality of the objectively-best robot anime."
    },
];