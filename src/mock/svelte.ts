import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";
import { createOidcSvelteApi_dependencyInjection } from "../svelte/svelte";
import { createMockOidc, type ParamsOfCreateMockOidc } from "../mock/oidc";

export function createMockSvelteOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    AutoLogin extends boolean = false
>(params: ValueOrAsyncGetter<ParamsOfCreateMockOidc<DecodedIdToken, AutoLogin>>) {
    return createOidcSvelteApi_dependencyInjection(params, createMockOidc);
}
