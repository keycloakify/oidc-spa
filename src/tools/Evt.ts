import { Deferred } from "./Deferred";

export type NonPostableEvt<T> = {
    waitFor: () => Promise<T>;
    subscribe: (next: (data: T) => void) => { unsubscribe: () => void };
    postCount: number;
};

export type Evt<T> = NonPostableEvt<T> & {
    post: (data: T) => void;
};

export function createEvt<T>(): Evt<T> {
    const listeners: Array<(data: T) => void> = [];
    let postCount = 0;

    const evt: Evt<T> = {
        subscribe: next => {
            listeners.push(next);
            let isActive = true;
            return {
                unsubscribe: () => {
                    if (!isActive) {
                        return;
                    }
                    isActive = false;
                    const i = listeners.indexOf(next);
                    if (i >= 0) {
                        listeners.splice(i, 1);
                    }
                }
            };
        },
        waitFor: () => {
            const d = new Deferred<T>();
            const { unsubscribe } = evt.subscribe(data => {
                unsubscribe();
                d.resolve(data);
            });
            return d.pr;
        },
        post: (data: T) => {
            postCount++;
            const snapshot = listeners.slice();
            for (const l of snapshot) {
                try {
                    l(data);
                } catch {}
            }
        },
        get postCount() {
            return postCount;
        }
    };

    return evt;
}
