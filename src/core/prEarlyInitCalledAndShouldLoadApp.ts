import { assert } from "../tools/tsafe/assert";

let prEarlyInitCalledAndShouldLoadApp_resolve: () => void | undefined;

export const prEarlyInitCalledAndShouldLoadApp = new Promise<void>(
    resolve => (prEarlyInitCalledAndShouldLoadApp_resolve = resolve)
);

export function resolvePrEarlyInitCalledAndShouldLoadApp() {
    assert(prEarlyInitCalledAndShouldLoadApp_resolve !== undefined);
    prEarlyInitCalledAndShouldLoadApp_resolve();
}
