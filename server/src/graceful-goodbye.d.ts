declare module 'graceful-goodbye' {
    export default function goodbye(beforeExit: () => Promise<void>, position?: number): () => void;

    export function exit(): void;
}