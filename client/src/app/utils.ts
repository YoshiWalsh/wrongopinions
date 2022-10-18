export function chunkArray(arr: Array<any>, chunkSize: number) {
    const numberOfChunks = Math.ceil(arr.length / chunkSize);
    return Array(numberOfChunks).fill(undefined).map((_, i) => arr.slice(i * chunkSize, (i + 1) * chunkSize));
}