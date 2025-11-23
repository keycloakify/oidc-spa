import { getStateData, getIsStatQueryParamValue } from "./StateData";
import { assert, type Equals } from "../tools/tsafe/assert";
import type { AuthResponse } from "./AuthResponse";
import { setBASE_URL } from "./BASE_URL";
import { resolvePrShouldLoadApp } from "./prShouldLoadApp";
import { isBrowser } from "../tools/isBrowser";
import { createEvt, type Evt } from "../tools/Evt";
import {
    handleTokenExfiltrationDefense_legacy,
    type Params as Params_handleTokenExfiltrationDefense_legacy
} from "./tokenExfiltrationDefense_legacy";
import { enableTokenExfiltrationDefense } from "./tokenExfiltrationDefense";

let hasEarlyInitBeenCalled = false;

const IFRAME_MESSAGE_PREFIX = "oidc-spa:cross-window-messaging:";

export type ParamsOfEarlyInit_legacy = Params_handleTokenExfiltrationDefense_legacy & {
    BASE_URL?: string;
};

export type ParamsOfEarlyInit = {
    /**
     * Base path of where is deployed the webapp
     * usually `import.meta.env.BASE_URL`
     * if omitted, can be provided to createOidc()
     */
    BASE_URL?: string;

    enableTokenExfiltrationDefense: boolean;
    /**
     * Only when enableTokenExfiltrationDefense: true
     *
     * Example ["vault.domain2.net", "minio.domain2.net", "*.lab.domain3.net"]
     * Note that any domains first party relative to where your app
     * is deployed will be automatically allowed.
     *
     * So for example if your app is deployed under:
     * dashboard.my-company.com
     * Authed request to the following domains will automatically be allowed (examples):
     * - minio.my-company.com
     * - minio.dashboard.my-company.com
     * - my-company.com
     *
     * BUT there is an exception to the rule. If your app is deployed under free default domain
     * provided by known hosting platform like
     * - xxx.vercel.com
     * - xxx.netlify.com
     * - xxx.github.com
     * - xxx.pages.dev (firebase)
     * - xxx.web.app (firebase)
     * - ...
     *
     * We we won't allow request to parent domain since those are multi tenant.
     *
     * Also, all filtering will be disabled when the app is ran with the dev server, so under:
     * - localhost
     * - 127.0.0.1
     * - [::]
     * */
    resourceServersAllowedHostnames?: string[];

    serviceWorkersAllowedHostnames?: string[];
};

export function oidcEarlyInit(params: ParamsOfEarlyInit | ParamsOfEarlyInit_legacy) {
    if (hasEarlyInitBeenCalled) {
        throw new Error("oidc-spa: oidcEarlyInit() Should be called only once");
    }

    hasEarlyInitBeenCalled = true;

    if (!isBrowser) {
        return { shouldLoadApp: true };
    }

    const { shouldLoadApp } = handleOidcCallback();

    if (shouldLoadApp) {
        token_exfiltration_defense: {
            if (!("enableTokenExfiltrationDefense" in params)) {
                handleTokenExfiltrationDefense_legacy({
                    freezeFetch: params.freezeFetch,
                    freezeXMLHttpRequest: params.freezeXMLHttpRequest,
                    freezeWebSocket: params.freezeWebSocket,
                    freezePromise: params.freezePromise,
                    safeMode: params.safeMode
                });
                break token_exfiltration_defense;
            }

            const {
                enableTokenExfiltrationDefense: doEnableTokenExfiltrationDefense,
                resourceServersAllowedHostnames,
                serviceWorkersAllowedHostnames
            } = params;

            if (!doEnableTokenExfiltrationDefense) {
                if (resourceServersAllowedHostnames !== undefined) {
                    console.warn(
                        [
                            "oidc-spa: resourceServersAllowedHostnames is ignored when",
                            "enableTokenExfiltrationDefense is set to false."
                        ].join(" ")
                    );
                }

                if (serviceWorkersAllowedHostnames !== undefined) {
                    console.warn(
                        [
                            "oidc-spa: serviceWorkersAllowedHostnames is ignored when",
                            "enableTokenExfiltrationDefense is set to false."
                        ].join(" ")
                    );
                }

                break token_exfiltration_defense;
            }

            enableTokenExfiltrationDefense({
                resourceServersAllowedHostnames,
                serviceWorkersAllowedHostnames
            });
        }

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
            const { BASE_URL } = params;

            if (BASE_URL !== undefined) {
                setBASE_URL({ BASE_URL });
            }
        }
    }

    resolvePrShouldLoadApp({ shouldLoadApp });

    return { shouldLoadApp };
}

let evtIframeAuthResponse: Evt<AuthResponse> | undefined = undefined;

export function getEvtIframeAuthResponse() {
    return (evtIframeAuthResponse ??= createEvt());
}

let redirectAuthResponse: AuthResponse | undefined = undefined;

export function getRedirectAuthResponse():
    | { authResponse: AuthResponse; clearAuthResponse: () => void }
    | { authResponse: undefined; clearAuthResponse?: never } {
    assert(hasEarlyInitBeenCalled, "34933395");

    return redirectAuthResponse === undefined
        ? { authResponse: undefined }
        : {
              authResponse: redirectAuthResponse,
              clearAuthResponse: () => {
                  redirectAuthResponse = undefined;
              }
          };
}

let rootRelativeOriginalLocationHref: string | undefined = undefined;

export function getRootRelativeOriginalLocationHref() {
    assert(rootRelativeOriginalLocationHref !== undefined, "033292");
    return rootRelativeOriginalLocationHref;
}

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
        rootRelativeOriginalLocationHref = location_urlObj.href.slice(location_urlObj.origin.length);
        return { shouldLoadApp: true };
    }

    rootRelativeOriginalLocationHref = location_urlObj.pathname;

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
        history.replaceState({}, "", rootRelativeOriginalLocationHref);
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
