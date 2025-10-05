import { createMockOidc, type ParamsOfCreateMockOidc } from "../mock/oidc";
import { createSvelteOidc_dependencyInjection } from "../svelte/index.svelte";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";

export function createMockSvelteOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    AutoLogin extends boolean = false
>(params: ValueOrAsyncGetter<ParamsOfCreateMockOidc<DecodedIdToken, AutoLogin>>) {
    return createSvelteOidc_dependencyInjection(params, createMockOidc);
}
