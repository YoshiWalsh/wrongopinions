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