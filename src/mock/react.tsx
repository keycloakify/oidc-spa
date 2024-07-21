import { createOidcReactApi_dependencyInjection } from "../react/react";
import { createMockOidc, type ParamsOfCreateMockOidc } from "./oidc";

/** @see: https://docs.oidc-spa.dev/documentation/mock */
export function createMockReactOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    IsAuthGloballyRequired extends boolean = false
>(params: ParamsOfCreateMockOidc<DecodedIdToken, IsAuthGloballyRequired>) {
    return createOidcReactApi_dependencyInjection(params, createMockOidc);
}
