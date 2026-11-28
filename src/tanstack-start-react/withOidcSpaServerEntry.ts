import type { Register } from "@tanstack/react-router";
// NOTE: This is actually "@tanstack/react-start/server" but since our module is not labeled as ESM we import it from here.
// it does not matter since it's type level only.
import type { RequestHandler } from "@tanstack/react-start-server";
import { getRootingCookies } from "../core/RoutingCookie";
import { getIsOidcSpaStateUrlParamValue } from "../core/StateData";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { buildValidRedirectUri } from "../core/earlyInit_homeUrlAndValidRedirectUri";
import { assert } from "../tools/tsafe/assert";

export function withOidcSpaServerEntry<T extends { fetch: RequestHandler<Register> }>(params: {
    serverEntry_original: T;
    resolvedConfigBase: string;
    oidcSpaVitePluginParams_redirectUriPath: string | undefined;
}): T {
    const {
        serverEntry_original,
        resolvedConfigBase,
        oidcSpaVitePluginParams_redirectUriPath = "/"
    } = params;

    const rootRelativeUrls = (() => {
        const homeUrl = toFullyQualifiedUrl({
            urlish: resolvedConfigBase,
            doAssertNoQueryParams: true,
            doOutputWithTrailingSlash: true,
            rootUrl_fullyQualified: "http://localhost"
        });

        let validRedirectUri: string;

        try {
            validRedirectUri = buildValidRedirectUri({
                homeUrl,
                redirectUriPath: oidcSpaVitePluginParams_redirectUriPath
            });
        } catch {
            // Leave invalid configuration to the client's detailed error handling.
            return undefined;
        }

        const toRootRelative = (url: string) => new URL(url).pathname;

        return {
            rootRelativeHomeUrl: toRootRelative(homeUrl),
            rootRelativeValidRedirectUri: toRootRelative(validRedirectUri)
        };
    })();

    if (rootRelativeUrls === undefined) {
        return serverEntry_original;
    }

    const { rootRelativeHomeUrl, rootRelativeValidRedirectUri } = rootRelativeUrls;

    return {
        ...serverEntry_original,
        fetch: async (request, requestOpts) => {
            handle: {
                const url = new URL(request.url);

                if (url.pathname !== rootRelativeValidRedirectUri) {
                    break handle;
                }

                if (request.method !== "GET" && request.method !== "HEAD") {
                    break handle;
                }

                const stateUrlParamValue = url.searchParams.get("state");

                const isForUs = (() => {
                    if (stateUrlParamValue === null) {
                        return false;
                    }

                    const isOidcSpaState = getIsOidcSpaStateUrlParamValue({
                        maybeStateUrlParamValue: stateUrlParamValue
                    });

                    return isOidcSpaState;
                })();

                if (!isForUs) {
                    if (rootRelativeHomeUrl === rootRelativeValidRedirectUri) {
                        break handle;
                    }

                    return serverEntry_original.fetch(
                        new Request(new URL(rootRelativeHomeUrl, url.origin).href, request),
                        requestOpts
                    );
                }

                assert(stateUrlParamValue !== null, "392203");

                const { routingCookies } = getRootingCookies({
                    cookieHeaderParamValue: request.headers.get("cookie")
                });

                const entry = routingCookies.find(
                    entry => entry.stateUrlParamValue === stateUrlParamValue
                );

                if (entry === undefined) {
                    if (rootRelativeHomeUrl === rootRelativeValidRedirectUri) {
                        const url_withAuthResponseCleared = new URL(url);

                        for (const name of [
                            "state",
                            "session_state",
                            "code",
                            "iss",
                            "error",
                            "error_description",
                            "error_uri"
                        ]) {
                            url_withAuthResponseCleared.searchParams.delete(name);
                        }

                        return serverEntry_original.fetch(
                            new Request(url_withAuthResponseCleared.href, request),
                            requestOpts
                        );
                    }

                    return serverEntry_original.fetch(
                        new Request(new URL(rootRelativeHomeUrl, url.origin).href, request),
                        requestOpts
                    );
                }

                const { rootRelativeReturnToUrl } = entry.routingCookie;

                let url_new: URL;

                try {
                    url_new = new URL(rootRelativeReturnToUrl, url.origin);
                } catch {
                    break handle;
                }

                if (
                    url_new.username !== "" ||
                    url_new.password !== "" ||
                    url_new.origin !== url.origin ||
                    (url_new.pathname !== rootRelativeHomeUrl.slice(0, -1) &&
                        !url_new.pathname.startsWith(rootRelativeHomeUrl))
                ) {
                    break handle;
                }

                return serverEntry_original.fetch(new Request(url_new.href, request), requestOpts);
            }

            return serverEntry_original.fetch(request, requestOpts);
        }
    };
}
