import { getStateData, getIsStatQueryParamValue } from "./StateData";
import { assert, type Equals } from "../tools/tsafe/assert";
import type { AuthResponse } from "./AuthResponse";
import { setBASE_URL_earlyInit } from "./earlyInit_BASE_URL";
import { isBrowser } from "../tools/isBrowser";
import { createEvt, type Evt } from "../tools/Evt";
import {
    setGetRootRelativeOriginalLocationHref_earlyInit,
    getRootRelativeOriginalLocationHref_earlyInit
} from "./earlyInit_rootRelativeOriginalLocationHref";
import { prModuleCreateOidc } from "./earlyInit_prModuleCreateOidc";

const IFRAME_MESSAGE_PREFIX = "oidc-spa:cross-window-messaging:";

export type ParamsOfEarlyInit = {
    /**
     * Base path of where is deployed the webapp
     * usually `import.meta.env.BASE_URL`
     * if omitted, can be provided to createOidc()
     */
    BASE_URL?: string;

    /**
     * Determines how session restoration is handled.
     * Session restoration allows users to stay logged in between visits
     * without needing to explicitly sign in each time.
     *
     * Options:
     *
     * - **"auto" (default)**:
     *   Automatically selects the best method.
     *   If the app’s domain shares a common parent domain with the authorization endpoint,
     *   an iframe is used for silent session restoration.
     *   Otherwise, a full-page redirect is used.
     *
     * - **"full page redirect"**:
     *   Forces full-page reloads for session restoration.
     *   Use this if your application is served with a restrictive CSP
     *   (e.g., `Content-Security-Policy: frame-ancestors "none"`)
     *   or `X-Frame-Options: DENY`, and you cannot modify those headers.
     *   This mode provides a slightly less seamless UX and will lead oidc-spa to
     *   store tokens in `localStorage` if multiple OIDC clients are used
     *   (e.g., your app communicates with several APIs).
     *
     * - **"iframe"**:
     *   Forces iframe-based session restoration.
     *   In development, if you go in your browser setting and allow your auth server’s domain
     *   to set third-party cookies this value will let you test your app
     *   with the local dev server as it will behave in production.
     *
     *  See: https://docs.oidc-spa.dev/v/v10/resources/third-party-cookies-and-session-restoration
     */
    sessionRestorationMethod?: "iframe" | "full page redirect" | "auto";

    /**
     * **Experimental.** When set to `"window"`, the OIDC instance cache and
     * earlyInit state are stored on `window` instead of module scope. This
     * allows multiple bundles of oidc-spa (e.g. from different micro-frontend
     * remotes) to share a single OIDC instance for the same issuerUri+clientId.
     *
     * Only enable this in trusted micro-frontend environments where all remotes
     * are under your control. When enabled, any script on the page can access
     * the shared OIDC state.
     *
     * Default: `undefined` (module-scoped, current behavior).
     */
    sharedScope?: "window";

    /** See: https://docs.oidc-spa.dev/v/v10/security-features/token-substitution */
    securityDefenses?: {
        enableBrowserRuntimeFreeze?: () => void;
        enableDPoP?: () => void;
        enableTokenSubstitution?: () => void;
    };
};

// These keys must match the ones in createOidc.ts
const SHARED_MEMO_KEY = "__oidc_spa_shared_prOidcByConfigId__" as const;
const SHARED_EARLY_INIT_KEY = "__oidc_spa_shared_earlyInit__" as const;

type SharedEarlyInitState = {
    shouldLoadApp: boolean;
    evtIframeAuthResponse: Evt<AuthResponse> | undefined;
    redirectAuthResponse: AuthResponse | undefined;
    clearRedirectAuthResponse: () => void;
};

declare global {
    interface Window {
        [SHARED_EARLY_INIT_KEY]?: SharedEarlyInitState;
    }
}

function getSharedState(): SharedEarlyInitState | undefined {
    return window[SHARED_EARLY_INIT_KEY];
}

function setSharedState(state: SharedEarlyInitState): void {
    window[SHARED_EARLY_INIT_KEY] = state;
}

function ensureSharedMemoMap(): void {
    if (!window[SHARED_MEMO_KEY]) {
        window[SHARED_MEMO_KEY] = new Map();
    }
}

let shouldLoadApp: boolean | undefined = undefined;

export function oidcEarlyInit(params?: ParamsOfEarlyInit) {
    if (shouldLoadApp !== undefined) {
        return { shouldLoadApp };
    }

    if (params?.sharedScope === "window") {
        // Create shared memoization map synchronously so createOidc
        // from any bundle can find it immediately.
        ensureSharedMemoMap();

        const existing = getSharedState();
        if (existing) {
            // Another bundle already ran earlyInit. Reuse its state.
            shouldLoadApp = existing.shouldLoadApp;

            // Still need to register this bundle's exports with its own createOidc module.
            const exports_earlyInit: import("./createOidc").Exports_earlyInit = shouldLoadApp
                ? {
                      shouldLoadApp: true,
                      getEvtIframeAuthResponse: () => {
                          return (existing.evtIframeAuthResponse ??= createEvt());
                      },
                      getRedirectAuthResponse: () => {
                          return existing.redirectAuthResponse === undefined
                              ? { authResponse: undefined }
                              : {
                                    authResponse: existing.redirectAuthResponse,
                                    clearAuthResponse: existing.clearRedirectAuthResponse
                                };
                      },
                      sessionRestorationMethod: params?.sessionRestorationMethod
                  }
                : { shouldLoadApp: false };

            prModuleCreateOidc.then(({ registerExports_earlyInit }) => {
                registerExports_earlyInit(exports_earlyInit);
            });

            return { shouldLoadApp };
        }

        // First bundle to init with sharedScope. Proceed normally but store state on window.
        console.warn(
            "oidc-spa: Shared scope enabled. OIDC state is accessible to all scripts on this page. " +
                "Only use this in trusted micro-frontend environments."
        );
    }

    shouldLoadApp = oidcEarlyInit_nonMemoized(params).shouldLoadApp;

    return { shouldLoadApp };
}

function oidcEarlyInit_nonMemoized(params: ParamsOfEarlyInit | undefined) {
    const { BASE_URL, sessionRestorationMethod, sharedScope, securityDefenses = {} } = params ?? {};

    if (!isBrowser) {
        return { shouldLoadApp: true };
    }

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

        if (BASE_URL !== undefined) {
            setBASE_URL_earlyInit({ BASE_URL });
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
            sessionRestorationMethod
        };

        if (sharedScope === "window") {
            setSharedState({
                shouldLoadApp: true,
                evtIframeAuthResponse,
                redirectAuthResponse,
                clearRedirectAuthResponse: () => {
                    redirectAuthResponse = undefined;
                }
            });
        }
    } else {
        exports_earlyInit = {
            shouldLoadApp: false
        };

        if (sharedScope === "window") {
            setSharedState({
                shouldLoadApp: false,
                evtIframeAuthResponse: undefined,
                redirectAuthResponse: undefined,
                clearRedirectAuthResponse: () => {}
            });
        }
    }

    prModuleCreateOidc.then(({ registerExports_earlyInit }) => {
        registerExports_earlyInit(exports_earlyInit);
    });

    return { shouldLoadApp };
}

let redirectAuthResponse: AuthResponse | undefined = undefined;

function handleOidcCallback(): {
    shouldLoadApp: boolean;
} {
    const location_urlObj = new URL(window.location.href);

    const locationHrefAssessment = (() => {
        fragment: {
            const stateUrlParamValue = new URLSearchParams(location_urlObj.hash.replace(/^#/, "")).get(
                "state"
            );

            if (stateUrlParamValue === null) {
                break fragment;
            }

            if (!getIsStatQueryParamValue({ maybeStateUrlParamValue: stateUrlParamValue })) {
                break fragment;
            }

            return { hasAuthResponseInUrl: true, responseMode: "fragment" } as const;
        }

        query: {
            const stateUrlParamValue = location_urlObj.searchParams.get("state");

            if (stateUrlParamValue === null) {
                break query;
            }

            if (!getIsStatQueryParamValue({ maybeStateUrlParamValue: stateUrlParamValue })) {
                break query;
            }

            if (
                location_urlObj.searchParams.get("client_id") !== null &&
                location_urlObj.searchParams.get("response_type") !== null &&
                location_urlObj.searchParams.get("redirect_uri") !== null
            ) {
                // NOTE: We are probably in a Keycloakify theme and oidc-spa was loaded by mistake.
                break query;
            }

            return { hasAuthResponseInUrl: true, responseMode: "query" } as const;
        }

        return { hasAuthResponseInUrl: false } as const;
    })();

    if (!locationHrefAssessment.hasAuthResponseInUrl) {
        setGetRootRelativeOriginalLocationHref_earlyInit({
            rootRelativeOriginalLocationHref: location_urlObj.href.slice(location_urlObj.origin.length)
        });
        return { shouldLoadApp: true };
    }

    setGetRootRelativeOriginalLocationHref_earlyInit({
        rootRelativeOriginalLocationHref: location_urlObj.pathname
    });

    const { authResponse } = (() => {
        const authResponse: AuthResponse = { state: "" };

        const searchParams = (() => {
            switch (locationHrefAssessment.responseMode) {
                case "fragment":
                    return new URLSearchParams(location_urlObj.hash.replace(/^#/, ""));
                case "query":
                    return location_urlObj.searchParams;
                default:
                    assert<Equals<typeof locationHrefAssessment, never>>(false);
            }
        })();

        for (const [key, value] of searchParams) {
            authResponse[key] = value;
        }

        assert(authResponse.state !== "", "063965");

        return { authResponse };
    })();

    const stateData = getStateData({ stateUrlParamValue: authResponse.state });

    if (stateData === undefined) {
        history.replaceState({}, "", getRootRelativeOriginalLocationHref_earlyInit());
        return { shouldLoadApp: true };
    }

    switch (stateData.context) {
        case "iframe":
            if (parent !== top) {
                const errorMessage = [
                    "oidc-spa: For security reasons, refusing to post the auth response.",
                    "If you want your app to be framable use sessionRestorationMethod: 'full page redirect'."
                ].join(" ");
                alert(errorMessage);

                throw new Error(errorMessage);
            }
            parent.postMessage(
                `${IFRAME_MESSAGE_PREFIX}${JSON.stringify(authResponse)}`,
                location.origin
            );
            return { shouldLoadApp: false };
        case "redirect": {
            redirectAuthResponse = authResponse;
            const rootRelativeRedirectUrl = (() => {
                if (stateData.action === "login" && authResponse.error === "consent_required") {
                    return stateData.rootRelativeRedirectUrl_consentRequiredCase;
                }
                return stateData.rootRelativeRedirectUrl;
            })();

            history.replaceState({}, "", rootRelativeRedirectUrl);
            return { shouldLoadApp: true };
        }
        default:
            assert<Equals<typeof stateData, never>>(false);
    }
}
