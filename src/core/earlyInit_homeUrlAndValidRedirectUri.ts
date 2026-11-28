import { assert } from "../tools/tsafe/assert";
import { getIsDeepLink } from "../tools/isDeepLink";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";

let state:
    | {
          homeUrl: string;
          validRedirectUri: string;
      }
    | undefined = undefined;

let resolve_prHomeUrlAndValidRedirectUriEstablished: () => void;

export const prHomeUrlAndValidRedirectUriEstablished = new Promise<void>(
    resolve => (resolve_prHomeUrlAndValidRedirectUriEstablished = resolve)
);

export function getHomeUrlAndValidRedirectUri() {
    assert(state !== undefined, "3022432");
    return state;
}

export function setHomeUrlAndValidRedirectUri(params: { BASE_URL: string; redirectUriPath: string }) {
    assert(state === undefined, "228");

    const { BASE_URL, redirectUriPath } = params;

    const homeUrl = toFullyQualifiedUrl({
        urlish: BASE_URL,
        doAssertNoQueryParams: true,
        doOutputWithTrailingSlash: true,
        rootUrl_fullyQualified: window.location.origin
    });

    if (
        !getIsDeepLink({
            fullyQualifiedUrl: homeUrl,
            relativeTo_fullyQualified: window.location.origin
        })
    ) {
        throw new Error(
            [
                "oidc-spa: Configuration Error,",
                `\`oidcEarlyInit({ BASE_URL: "${BASE_URL}"})\` is not valid,`,
                "BASE_URL is external to the current origin",
                `BASE_URL is typically "/" or "/dashboard/"`
            ].join(" ")
        );
    }

    if (
        !getIsDeepLink({
            fullyQualifiedUrl: window.location.href,
            relativeTo_fullyQualified: homeUrl
        })
    ) {
        throw new Error(
            [
                "oidc-spa: Configuration Error,",
                `We are currently at: ${window.location.origin}${window.location.pathname}\n`,
                `however you've specified with \`oidcEarlyInit({ BASE_URL: "${BASE_URL}"})\``,
                `that your whole app is supposed to be hosted under ${homeUrl}.\n`
            ].join(" ")
        );
    }

    const validRedirectUri = buildValidRedirectUri({ homeUrl, redirectUriPath });

    state = {
        homeUrl,
        validRedirectUri
    };

    resolve_prHomeUrlAndValidRedirectUriEstablished();
}

export function buildValidRedirectUri(params: { homeUrl: string; redirectUriPath: string }): string {
    const { homeUrl, redirectUriPath } = params;

    if (!redirectUriPath.startsWith("/") || !redirectUriPath.endsWith("/")) {
        throw new Error("oidc-spa: redirectUriPath should start and end with '/'");
    }

    if (redirectUriPath.includes("?") || redirectUriPath.includes("#")) {
        throw new Error(
            [
                "oidc-spa: Configuration Error,",
                `redirectUriPath ${JSON.stringify(redirectUriPath)} must not contain`,
                "query parameters or a fragment."
            ].join(" ")
        );
    }

    const validRedirectUri = toFullyQualifiedUrl({
        urlish: redirectUriPath,
        doAssertNoQueryParams: true,
        doOutputWithTrailingSlash: true,
        rootUrl_fullyQualified: homeUrl
    });

    if (
        !getIsDeepLink({
            fullyQualifiedUrl: validRedirectUri,
            relativeTo_fullyQualified: homeUrl
        })
    ) {
        throw new Error(
            [
                "oidc-spa: Configuration Error,",
                `redirectUriPath ${JSON.stringify(redirectUriPath)} resolves to ${validRedirectUri},`,
                `which is outside the application base ${homeUrl}.`,
                "Use '/' for the application home or a subpath such as '/openid-callback/'."
            ].join(" ")
        );
    }

    return validRedirectUri;
}
