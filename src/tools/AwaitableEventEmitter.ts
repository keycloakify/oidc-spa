import { Deferred } from "./Deferred";
import { assert, is } from "../vendor/frontend/tsafe";

export type AwaitableEventEmitter<T> = {
    waitFor: () => Promise<T>;
    post: (data: T) => void;
};

export function createAwaitableEventEmitter<T>(): AwaitableEventEmitter<T> {
    const eventTarget = new EventTarget();
    const KEY = "event";

    return {
        waitFor: () => {
            const d = new Deferred<T>();

            const listener = (e: Event) => {
                assert(is<CustomEvent<T>>(e));

                eventTarget.removeEventListener(KEY, listener);

                d.resolve(e.detail);
            };

            eventTarget.addEventListener(KEY, listener);

            return d.pr;
        },
        post: (data: T) => {
            eventTarget.dispatchEvent(new CustomEvent(KEY, { detail: data }));
        }
    };
}
