import { createOidcReactApi_dependencyInjection } from "../react/react";
import { createMockOidc, type ParamsOfCreateMockOidc } from "./oidc";

/** @see: https://docs.oidc-spa.dev/documentation/mock */
export function createMockReactOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    IsAuthRequiredOnEveryPages extends boolean = false
>(params: ParamsOfCreateMockOidc<DecodedIdToken, IsAuthRequiredOnEveryPages>) {
    return createOidcReactApi_dependencyInjection(params, createMockOidc);
}
