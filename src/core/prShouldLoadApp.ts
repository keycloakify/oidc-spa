import { assert } from "../tools/tsafe/assert";

let prShouldLoadApp_resolve: (shouldLoadApp: boolean) => void | undefined;

export const prShouldLoadApp = new Promise<boolean>(resolve => (prShouldLoadApp_resolve = resolve));

export function resolvePrShouldLoadApp(params: { shouldLoadApp: boolean }) {
    const { shouldLoadApp } = params;
    assert(prShouldLoadApp_resolve !== undefined);
    prShouldLoadApp_resolve(shouldLoadApp);
}
