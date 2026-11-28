import { getStateData, getIsOidcSpaStateUrlParamValue } from "./StateData";
import { assert, type Equals } from "../tools/tsafe/assert";
import { typeGuard } from "../tools/tsafe/typeGuard";
import type { AuthResponse } from "./AuthResponse";
import { isBrowser } from "../tools/isBrowser";
import { createEvt, type Evt } from "../tools/Evt";
import { setRootRelativeOriginalLocationHref_earlyInit } from "./earlyInit_rootRelativeOriginalLocationHref";
import { prModuleCreateOidc } from "./earlyInit_prModuleCreateOidc";
import {
    setHomeUrlAndValidRedirectUri,
    getHomeUrlAndValidRedirectUri
} from "./earlyInit_homeUrlAndValidRedirectUri";

const IFRAME_MESSAGE_PREFIX = "oidc-spa:cross-window-messaging:";

export type ParamsOfEarlyInit = {
    /**
     * Application base URL, typically import.meta.env.BASE_URL in Vite.
     * Use "/" when hosted at the domain root, or e.g. "/dashboard/" for a subpath.
     */
    BASE_URL: string;

    /** See: https://docs.oidc-spa.dev/v/v10/security-features/token-substitution */
    securityDefenses?: {
        enableBrowserRuntimeFreeze?: () => void;
        enableDPoP?: () => void;
        enableTokenSubstitution?: () => void;
    };

    /**
     * Advanced deployment escape hatch. Leave unset in most applications; configure
     * only when following the deployment setup of a supported oidc-spa example.
     *
     * Defaults to false. Write a temporary cookie containing the post-login return
     * URL so a server integration can render the destination at the callback URL,
     * matching the page the client will hydrate. This is routing metadata, not
     * authentication evidence, and requires a corresponding server integration.
     * Forces response_mode=query because URL fragments are not sent to the server.
     * Leave disabled when the frontend is served as static files.
     */
    enableRoutingCookie?: boolean;

    /**
     * Advanced deployment escape hatch. Leave unset in most applications; configure
     * only when following the deployment setup of a supported oidc-spa example.
     *
     * Callback path relative to BASE_URL. Defaults to "/": the application home
     * is the redirect URI. For example, BASE_URL="/dashboard/" with
     * redirectUriPath="/openid-callback/" uses "/dashboard/openid-callback/".
     * Register the resulting absolute URL with your identity provider.
     * Must start and end with "/", contain no query or fragment, and stay within
     * the application base. No application route is needed: early initialization
     * consumes the callback before loading the app. Your server or CDN must still
     * serve the application's HTML at this URL; a static deployment may need a
     * rewrite to a neutral app shell instead of a prerendered page.
     */
    redirectUriPath?: string;
};

let shouldLoadApp: boolean | undefined = undefined;

export function oidcEarlyInit(params: ParamsOfEarlyInit) {
    if (shouldLoadApp !== undefined) {
        return { shouldLoadApp };
    }

    shouldLoadApp = oidcEarlyInit_nonMemoized(params).shouldLoadApp;

    return { shouldLoadApp };
}

function oidcEarlyInit_nonMemoized(params: ParamsOfEarlyInit) {
    const {
        BASE_URL,
        securityDefenses = {},
        enableRoutingCookie = false,
        redirectUriPath = "/"
    } = params;

    if (!isBrowser) {
        return { shouldLoadApp: true };
    }

    setHomeUrlAndValidRedirectUri({ BASE_URL, redirectUriPath });

    const { shouldLoadApp } = handleOidcCallback();

    let exports_earlyInit: import("./createOidc").Exports_earlyInit;

    if (shouldLoadApp) {
        let evtIframeAuthResponse: Evt<AuthResponse> | undefined = undefined;

        {
            const _MessageEvent_prototype_data_get = (() => {
                const pd = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "data");

                assert(pd !== undefined);

                const { get } = pd;

                assert(get !== undefined);

                return get;
            })();

            const _MessageEvent_prototype_origin_get = (() => {
                const pd = Object.getOwnPropertyDescriptor(MessageEvent.prototype, "origin");

                assert(pd !== undefined);

                const { get } = pd;

                assert(get !== undefined);

                return get;
            })();

            const _Event_prototype_stopImmediatePropagation_value =
                Event.prototype.stopImmediatePropagation;

            const origin = window.location.origin;

            window.addEventListener(
                "message",
                event => {
                    if (_MessageEvent_prototype_origin_get.call(event) !== origin) {
                        return;
                    }

                    const eventData: unknown = _MessageEvent_prototype_data_get.call(event);

                    if (typeof eventData !== "string") {
                        return;
                    }

                    if (!eventData.startsWith(IFRAME_MESSAGE_PREFIX)) {
                        return;
                    }

                    _Event_prototype_stopImmediatePropagation_value.call(event);

                    const authResponse: AuthResponse = JSON.parse(
                        eventData.slice(IFRAME_MESSAGE_PREFIX.length)
                    );

                    (evtIframeAuthResponse ??= createEvt()).post(authResponse);
                },
                {
                    capture: true,
                    once: false,
                    passive: false
                }
            );
        }

        {
            const { enableBrowserRuntimeFreeze, enableDPoP, enableTokenSubstitution } = securityDefenses;

            enableDPoP?.();
            enableTokenSubstitution?.();
            enableBrowserRuntimeFreeze?.();
        }

        exports_earlyInit = {
            shouldLoadApp: true,
            getEvtIframeAuthResponse: () => {
                return (evtIframeAuthResponse ??= createEvt());
            },
            getRedirectAuthResponse: () => {
                return redirectAuthResponse === undefined
                    ? { authResponse: undefined }
                    : {
                          authResponse: redirectAuthResponse,
                          clearAuthResponse: () => {
                              redirectAuthResponse = undefined;
                          }
                      };
            },
            enableRoutingCookie
        };
    } else {
        exports_earlyInit = {
            shouldLoadApp: false
        };
    }

    prModuleCreateOidc.then(({ registerExports_earlyInit }) => {
        registerExports_earlyInit(exports_earlyInit);
    });

    return { shouldLoadApp };
}

let redirectAuthResponse: AuthResponse | undefined = undefined;

function handleOidcCallback(): { shouldLoadApp: boolean } {
    const originalLocationHref_obj = new URL(window.location.href);

    const { homeUrl, validRedirectUri } = getHomeUrlAndValidRedirectUri();

    const areWeOnTheCallbackUrl = (() => {
        const removeQueryAndHash = (url: string) => {
            const url_obj = new URL(url);
            url_obj.hash = "";
            url_obj.search = "";
            return url_obj.href;
        };

        return (
            removeQueryAndHash(originalLocationHref_obj.href) === removeQueryAndHash(validRedirectUri)
        );
    })();

    const { readUrlParameter, readAllUrlParameters } = (() => {
        let urlSearchParams_fragment: URLSearchParams;

        try {
            urlSearchParams_fragment = new URLSearchParams(
                originalLocationHref_obj.hash.replace(/^#/, "")
            );
        } catch {}

        const urlSearchParams_query = originalLocationHref_obj.searchParams;

        const getSearchParams = (from: "fragment" | "query") => {
            switch (from) {
                case "fragment":
                    return urlSearchParams_fragment;
                case "query":
                    return urlSearchParams_query;
                default:
                    assert<Equals<typeof from, never>>(false);
            }
        };

        function readUrlParameter(params: {
            from: "fragment" | "query";
            name: string;
        }): string | undefined {
            const { from, name } = params;

            const searchParams = getSearchParams(from);

            return searchParams.get(name) ?? undefined;
        }

        function readAllUrlParameters(params: { from: "fragment" | "query" }) {
            const { from } = params;
            const record: Record<string, string | undefined> = {};

            for (const [key, value] of getSearchParams(from)) {
                record[key] = value;
            }

            return record;
        }

        return { readUrlParameter, readAllUrlParameters };
    })();

    const toRootRelative = (url: string) => url.slice(new URL(url).origin.length);

    const { hasStateParamInUrl, responseMode } = (() => {
        fragment: {
            const stateUrlParamValue = readUrlParameter({ from: "fragment", name: "state" });

            if (stateUrlParamValue === undefined) {
                break fragment;
            }

            return {
                hasStateParamInUrl: true,
                responseMode: "fragment"
            } as const;
        }
        query: {
            const stateUrlParamValue = readUrlParameter({ from: "query", name: "state" });

            if (stateUrlParamValue === undefined) {
                break query;
            }

            if (
                readUrlParameter({ from: "query", name: "client_id" }) !== undefined &&
                readUrlParameter({ from: "query", name: "response_type" }) !== undefined &&
                readUrlParameter({ from: "query", name: "redirect_uri" }) !== undefined
            ) {
                // NOTE: We are probably in a Keycloakify theme and oidc-spa was loaded by mistake.
                break query;
            }

            return {
                hasStateParamInUrl: true,
                responseMode: "query"
            } as const;
        }
        return { hasStateParamInUrl: false } as const;
    })();

    const getRootRelativeOriginalLocationHref_withAuthResponseCleared = () => {
        assert(hasStateParamInUrl, "3922");

        const url_obj = new URL(originalLocationHref_obj.href);

        const urlSearchParams: URLSearchParams = (() => {
            switch (responseMode) {
                case "fragment":
                    return new URLSearchParams(url_obj.hash.replace(/^#/, ""));
                case "query":
                    return url_obj.searchParams;
            }
        })();

        for (const name of [
            "state",
            "session_state",
            "code",
            "iss",
            "error",
            "error_description",
            "error_uri"
        ]) {
            if (urlSearchParams.has(name)) {
                urlSearchParams.delete(name);
            }
        }

        switch (responseMode) {
            case "fragment":
                url_obj.hash = urlSearchParams.toString();
                break;
            case "query":
                url_obj.search = urlSearchParams.toString();
                break;
            default:
                assert<Equals<typeof responseMode, never>>(false);
        }

        return toRootRelative(url_obj.href);
    };

    if (!areWeOnTheCallbackUrl) {
        // See: https://github.com/keycloakify/keycloak-account-ui/issues/10
        special_compat_case: {
            if (!hasStateParamInUrl) {
                break special_compat_case;
            }

            const stateUrlParamValue = readUrlParameter({ from: responseMode, name: "state" });

            assert(stateUrlParamValue !== undefined);

            const isOidcSpaState = getIsOidcSpaStateUrlParamValue({
                maybeStateUrlParamValue: stateUrlParamValue
            });

            if (!isOidcSpaState) {
                break special_compat_case;
            }

            const rootRelativeOriginalLocationHref_withAuthResponseCleared =
                getRootRelativeOriginalLocationHref_withAuthResponseCleared();

            setRootRelativeOriginalLocationHref_earlyInit({
                rootRelativeOriginalLocationHref:
                    rootRelativeOriginalLocationHref_withAuthResponseCleared
            });

            history.replaceState({}, "", rootRelativeOriginalLocationHref_withAuthResponseCleared);

            return { shouldLoadApp: true };
        }

        setRootRelativeOriginalLocationHref_earlyInit({
            rootRelativeOriginalLocationHref: toRootRelative(originalLocationHref_obj.href)
        });

        return { shouldLoadApp: true };
    }

    block_rogue_authorization: {
        do_not_block_if_state_is_from_oidc_spa: {
            if (!hasStateParamInUrl) {
                break do_not_block_if_state_is_from_oidc_spa;
            }

            const stateUrlParamValue = readUrlParameter({ from: responseMode, name: "state" });

            assert(stateUrlParamValue !== undefined, "39293");

            const isFromOidcSpa = getIsOidcSpaStateUrlParamValue({
                maybeStateUrlParamValue: stateUrlParamValue
            });

            if (isFromOidcSpa) {
                break block_rogue_authorization;
            }
        }

        const code_fragment = readUrlParameter({ from: "fragment", name: "code" });
        const code_query = readUrlParameter({ from: "query", name: "code" });

        if (code_fragment === undefined && code_query === undefined) {
            break block_rogue_authorization;
        }

        console.error("oidc-spa: A process is trying to get issued tokens");

        window.location.href = homeUrl;

        return { shouldLoadApp: false };
    }

    handle_not_for_us: {
        const isForUs = (() => {
            if (!hasStateParamInUrl) {
                return false;
            }

            const stateUrlParamValue = readUrlParameter({ from: responseMode, name: "state" });

            assert(stateUrlParamValue !== undefined);

            const isOidcSpaState = getIsOidcSpaStateUrlParamValue({
                maybeStateUrlParamValue: stateUrlParamValue
            });

            return isOidcSpaState;
        })();

        if (isForUs) {
            break handle_not_for_us;
        }

        if (homeUrl === validRedirectUri) {
            const rootRelativeOriginalLocationHref = toRootRelative(originalLocationHref_obj.href);

            setRootRelativeOriginalLocationHref_earlyInit({
                rootRelativeOriginalLocationHref
            });

            return { shouldLoadApp: true };
        }

        setRootRelativeOriginalLocationHref_earlyInit({
            rootRelativeOriginalLocationHref: toRootRelative(homeUrl)
        });

        history.replaceState({}, "", homeUrl);

        return { shouldLoadApp: true };
    }

    assert(hasStateParamInUrl, "3940");

    const authResponse = readAllUrlParameters({ from: responseMode });

    assert(typeGuard<AuthResponse>(authResponse, authResponse["state"] !== undefined), "3382203");

    const stateData = getStateData({ stateUrlParamValue: authResponse.state });

    if (stateData === undefined) {
        if (homeUrl === validRedirectUri) {
            const rootRelativeOriginalLocationHref_withAuthResponseCleared =
                getRootRelativeOriginalLocationHref_withAuthResponseCleared();

            setRootRelativeOriginalLocationHref_earlyInit({
                rootRelativeOriginalLocationHref:
                    rootRelativeOriginalLocationHref_withAuthResponseCleared
            });

            history.replaceState({}, "", rootRelativeOriginalLocationHref_withAuthResponseCleared);

            return { shouldLoadApp: true };
        }

        console.log("This is an outdated state, we redirect to home");

        setRootRelativeOriginalLocationHref_earlyInit({
            rootRelativeOriginalLocationHref: toRootRelative(homeUrl)
        });

        history.replaceState({}, "", homeUrl);

        return { shouldLoadApp: true };
    }

    switch (stateData.context) {
        case "iframe":
            parent.postMessage(
                `${IFRAME_MESSAGE_PREFIX}${JSON.stringify(authResponse)}`,
                location.origin
            );
            return { shouldLoadApp: false };
        case "redirect": {
            redirectAuthResponse = authResponse;
            const { rootRelativeReturnToUrl } = stateData;

            setRootRelativeOriginalLocationHref_earlyInit({
                rootRelativeOriginalLocationHref: rootRelativeReturnToUrl
            });

            history.replaceState({}, "", rootRelativeReturnToUrl);
            return { shouldLoadApp: true };
        }
        default:
            assert<Equals<typeof stateData, never>>(false);
    }
}
