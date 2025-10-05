import { getContext, setContext } from "svelte";
import type { Oidc } from "../core";

const oidcContextKey = Symbol("oidc");

export const setOidcContext = <DecodedIdToken extends Record<string, unknown>>(context: {
    oidc: Oidc<DecodedIdToken>;
}) => {
    setContext(oidcContextKey, context);
};

export const getOidcContext = <DecodedIdToken extends Record<string, unknown>>() => {
    return getContext<{ oidc: Oidc<DecodedIdToken> }>(oidcContextKey);
};
