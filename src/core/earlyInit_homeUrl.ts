import { assert } from "../tools/tsafe/assert";
import { getIsDeepLink } from "../tools/isDeepLink";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";

let homeUrl: string | undefined = undefined;

let resolve_prBASE_URL_earlyInit_set: () => void;

export const prHomeUrl_earlyInit_set = new Promise<void>(
    resolve => (resolve_prBASE_URL_earlyInit_set = resolve)
);

export function getHomeUrl_earlyInit() {
    assert(homeUrl !== undefined, "3022432");
    return homeUrl;
}

export function setHomeUrl_earlyInit(params: { BASE_URL: string }) {
    assert(homeUrl === undefined, "228");

    const { BASE_URL } = params;

    homeUrl = toFullyQualifiedUrl({
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

    resolve_prBASE_URL_earlyInit_set();
}
