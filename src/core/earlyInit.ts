import { getStateData, getIsStatQueryParamValue } from "./StateData";
import { assert, type Equals } from "../tools/tsafe/assert";
import type { AuthResponse } from "./AuthResponse";
import { setBASE_URL_earlyInit } from "./earlyInit_BASE_URL";
import { resolvePrShouldLoadApp } from "./earlyInit_prShouldLoadApp";
import { isBrowser } from "../tools/isBrowser";
import { createEvt, type Evt } from "../tools/Evt";
import { implementFetchAndXhrDPoPInterceptor } from "./earlyInit_DPoP";
import { freezeBrowserRuntime, type ApiName } from "./earlyInit_freezeBrowserRuntime";
import {
    setGetRootRelativeOriginalLocationHref_earlyInit,
    getRootRelativeOriginalLocationHref_earlyInit
} from "./earlyInit_rootRelativeOriginalLocationHref";

let hasEarlyInitBeenCalled = false;

const IFRAME_MESSAGE_PREFIX = "oidc-spa:cross-window-messaging:";

export type ParamsOfEarlyInit = {
    /**
     * Base path of where is deployed the webapp
     * usually `import.meta.env.BASE_URL`
     * if omitted, can be provided to createOidc()
     */
    BASE_URL?: string;

    /** See: https://docs.oidc-spa.dev/security-features/browser-runtime-freeze */
    browserRuntimeFreeze?:
        | false
        | {
              enabled: true;
              exclude?: ApiName[];
          };

    /** See: https://docs.oidc-spa.dev/v/v9/security-features/token-substitution */
    extraDefenseHook?: () => void;
};

export function oidcEarlyInit(params: ParamsOfEarlyInit) {
    if (hasEarlyInitBeenCalled) {
        throw new Error("oidc-spa: oidcEarlyInit() Should be called only once");
    }

    hasEarlyInitBeenCalled = true;

    const { BASE_URL, browserRuntimeFreeze, extraDefenseHook } = params;

    if (!isBrowser) {
        return { shouldLoadApp: true };
    }

    const { shouldLoadApp } = handleOidcCallback();

    if (shouldLoadApp) {
        implementFetchAndXhrDPoPInterceptor();

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

        extraDefenseHook?.();

        if (!!browserRuntimeFreeze) {
            freezeBrowserRuntime({
                excludedApiNames: browserRuntimeFreeze.exclude ?? []
            });
        }

        import("./createOidc").then(({ registerEarlyInitSensitiveBindings }) => {
            registerEarlyInitSensitiveBindings({
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
                }
            });
        });
    }

    resolvePrShouldLoadApp({ shouldLoadApp });

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
