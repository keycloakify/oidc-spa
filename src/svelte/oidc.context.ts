import { getContext, setContext } from "svelte";
import type { Oidc } from "../core";

export const setOidcContext = <DecodedIdToken extends Record<string, unknown>>(
    oidcContextKey: symbol,
    context: {
        oidc: Oidc<DecodedIdToken>;
    }
) => {
    setContext(oidcContextKey, context);
};

export const getOidcContext = <DecodedIdToken extends Record<string, unknown>>(
    oidcContextKey: symbol
) => {
    return getContext<{ oidc: Oidc<DecodedIdToken> }>(oidcContextKey);
};
