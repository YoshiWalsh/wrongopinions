import { setTimeout as delay } from 'timers/promises';

let ratelimitPromise = Promise.resolve();
export function ratelimit(seconds: number): Promise<void> {
    return new Promise(resolve => {
        ratelimitPromise = ratelimitPromise.then(() => {
            resolve();
            return delay(seconds * 1000);
        })
    });
}

export async function retry<T>(func: () => Promise<T>, maxAttempts: number, ratelimitSeconds?: number): Promise<T> {
    let attempt = 0;
    while(true) {
        attempt++;
        try {
            return await func();
        } catch (ex) {
            if(attempt >= maxAttempts) {
                throw ex;
            }
            if(ratelimitSeconds) {
                await ratelimit(ratelimitSeconds);
            }
        }
    }
}