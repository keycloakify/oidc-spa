import { getIsStatQueryParamValue } from "./StateData";
import { assert, type Equals } from "../tools/tsafe/assert";
import type { AuthResponse } from "./AuthResponse";

export type OidcRedirectResponseMode =
    | { hasAuthResponseInUrl: true; responseMode: "fragment" | "query" }
    | { hasAuthResponseInUrl: false; responseMode: undefined };

export function hasOidcRedirectResponse(url: string): OidcRedirectResponseMode {
    let urlObj: URL;

    try {
        urlObj = new URL(url);
    } catch {
        return { hasAuthResponseInUrl: false, responseMode: undefined };
    }

    fragment: {
        const stateUrlParamValue = new URLSearchParams(urlObj.hash.replace(/^#/, "")).get("state");

        if (stateUrlParamValue === null) {
            break fragment;
        }

        if (!getIsStatQueryParamValue({ maybeStateUrlParamValue: stateUrlParamValue })) {
            break fragment;
        }

        return { hasAuthResponseInUrl: true, responseMode: "fragment" };
    }

    query: {
        const stateUrlParamValue = urlObj.searchParams.get("state");

        if (stateUrlParamValue === null) {
            break query;
        }

        if (!getIsStatQueryParamValue({ maybeStateUrlParamValue: stateUrlParamValue })) {
            break query;
        }

        if (
            urlObj.searchParams.get("client_id") !== null &&
            urlObj.searchParams.get("response_type") !== null &&
            urlObj.searchParams.get("redirect_uri") !== null
        ) {
            break query;
        }

        return { hasAuthResponseInUrl: true, responseMode: "query" };
    }

    return { hasAuthResponseInUrl: false, responseMode: undefined };
}

export function extractOidcRedirectResponse(
    url: string,
    responseMode: "fragment" | "query"
): AuthResponse {
    const urlObj = new URL(url);

    const searchParams = (() => {
        switch (responseMode) {
            case "fragment":
                return new URLSearchParams(urlObj.hash.replace(/^#/, ""));
            case "query":
                return urlObj.searchParams;
            default:
                assert<Equals<typeof responseMode, never>>(false);
        }
    })();

    const authResponse: AuthResponse = { state: "" };

    for (const [key, value] of searchParams) {
        authResponse[key] = value;
    }

    assert(authResponse.state !== "", "063965");

    return authResponse;
}
