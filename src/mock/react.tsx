import { createOidcReactApi_dependencyInjection } from "../react/react";
import { createMockOidc, type ParamsOfCreateMockOidc } from "./oidc";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";

/** @see: https://docs.oidc-spa.dev/v/v4/documentation/mock */
export function createMockReactOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    IsAuthGloballyRequired extends boolean = false
>(params: ValueOrAsyncGetter<ParamsOfCreateMockOidc<DecodedIdToken, IsAuthGloballyRequired>>) {
    return createOidcReactApi_dependencyInjection(params, createMockOidc);
}
