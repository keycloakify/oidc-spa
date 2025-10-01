import { Deferred } from "./Deferred";
import { assert, is } from "../tools/tsafe/assert";

export type NonPostableEvt<T> = {
    waitFor: () => Promise<T>;
    subscribe: (next: (data: T) => void) => { unsubscribe: () => void };
    postCount: number;
};

export type Evt<T> = NonPostableEvt<T> & {
    post: (data: T) => void;
};

export function createEvt<T>(): Evt<T> {
    const eventTarget = new EventTarget();
    const KEY = "event";

    let postCount = 0;

    const evt: Evt<T> = {
        subscribe: next => {
            const listener = (e: Event) => {
                assert(is<CustomEvent<T>>(e));

                next(e.detail);
            };

            eventTarget.addEventListener(KEY, listener);

            return {
                unsubscribe: () => {
                    eventTarget.removeEventListener(KEY, listener);
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
            eventTarget.dispatchEvent(new CustomEvent(KEY, { detail: data }));
        },
        get postCount() {
            return postCount;
        }
    };

    return evt;
}
