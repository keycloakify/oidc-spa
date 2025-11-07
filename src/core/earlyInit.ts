import { getStateData, getIsStatQueryParamValue } from "./StateData";
import { assert, type Equals } from "../tools/tsafe/assert";
import type { AuthResponse } from "./AuthResponse";
import { setOidcRequiredPostHydrationReplaceNavigationUrl } from "./requiredPostHydrationReplaceNavigationUrl";
import { setBASE_URL } from "./BASE_URL";
import { resolvePrShouldLoadApp } from "./prShouldLoadApp";
import { isBrowser } from "../tools/isBrowser";
import { createEvt, type Evt } from "../tools/Evt";

let hasEarlyInitBeenCalled = false;

const IFRAME_MESSAGE_PREFIX = "oidc-spa:cross-window-messaging:";

export function oidcEarlyInit(params: {
    freezeFetch?: boolean;
    freezeXMLHttpRequest?: boolean;
    freezeWebSocket?: boolean;
    freezePromise?: boolean;
    safeMode?: boolean;
    isPostLoginRedirectManual?: boolean;
    BASE_URL?: string;
}) {
    if (hasEarlyInitBeenCalled) {
        throw new Error("oidc-spa: oidcEarlyInit() Should be called only once");
    }

    hasEarlyInitBeenCalled = true;

    if (!isBrowser) {
        return { shouldLoadApp: true };
    }

    const {
        freezeFetch,
        freezeXMLHttpRequest,
        freezeWebSocket,
        freezePromise,
        safeMode = false,
        isPostLoginRedirectManual = false,
        BASE_URL
    } = params;

    const { shouldLoadApp } = handleOidcCallback({ isPostLoginRedirectManual });

    if (shouldLoadApp) {
        const createWriteError = (target: string) =>
            new Error(
                [
                    `oidc-spa: ${target} has been freezed for security reason.`,
                    "set `safeMode: false` in the Vite plugin configuration to get rid",
                    "of this error at the cost of security.",
                    "If you think this restriction is overzealous please open an issue at",
                    "https://github.com/keycloakify/oidc-spa"
                ].join(" ")
            );

        for (const name of [
            "fetch",
            "XMLHttpRequest",
            "WebSocket",
            "String",
            "Object",
            "Promise",
            "Array",
            "RegExp",
            "TextEncoder",
            "Uint8Array",
            "Uint32Array",
            "Response",
            "Reflect",
            "JSON",
            "encodeURIComponent",
            "decodeURIComponent",
            "atob",
            "btoa"
        ] as const) {
            const doSkip = (() => {
                switch (name) {
                    case "XMLHttpRequest":
                        if (freezeXMLHttpRequest !== undefined) {
                            return !freezeXMLHttpRequest;
                        }
                        break;
                    case "fetch":
                        if (freezeFetch !== undefined) {
                            return !freezeFetch;
                        }
                        break;
                    case "WebSocket":
                        if (freezeWebSocket !== undefined) {
                            return !freezeWebSocket;
                        }
                        break;
                    case "Promise":
                        if (freezePromise !== undefined) {
                            return !freezePromise;
                        }
                        break;
                }

                return !safeMode;
            })();

            if (doSkip) {
                continue;
            }

            const original = window[name];

            if ("prototype" in original) {
                for (const propertyName of Object.getOwnPropertyNames(original.prototype)) {
                    if (name === "Object" && propertyName === "toString") {
                        continue;
                    }

                    const pd = Object.getOwnPropertyDescriptor(original.prototype, propertyName);

                    assert(pd !== undefined);

                    if (!pd.configurable) {
                        continue;
                    }

                    Object.defineProperty(original.prototype, propertyName, {
                        enumerable: pd.enumerable,
                        configurable: false,
                        ...("value" in pd
                            ? {
                                  get: () => pd.value,
                                  set: () => {
                                      throw createWriteError(`window.${name}.prototype.${propertyName}`);
                                  }
                              }
                            : {
                                  get: pd.get,
                                  set:
                                      pd.set ??
                                      (() => {
                                          throw createWriteError(
                                              `window.${name}.prototype.${propertyName}`
                                          );
                                      })
                              })
                    });
                }
            }

            Object.freeze(original);

            Object.defineProperty(window, name, {
                configurable: false,
                enumerable: true,
                get: () => original,
                set: () => {
                    throw createWriteError(`window.${name}`);
                }
            });
        }

        if (safeMode) {
            const original = Function.prototype.call;

            Object.defineProperty(Function.prototype, "call", {
                configurable: false,
                enumerable: true,
                get: () => original,
                set: () => {
                    throw createWriteError("window.Promise.prototype.call);");
                }
            });
        }

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

        const _Event_prototype_stopImmediatePropagation_value = Event.prototype.stopPropagation;

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

        if (BASE_URL !== undefined) {
            setBASE_URL({ BASE_URL });
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

function handleOidcCallback(params: { isPostLoginRedirectManual?: boolean }): {
    shouldLoadApp: boolean;
} {
    const { isPostLoginRedirectManual } = params;

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
                while (true) {
                    alert(
                        [
                            "oidc-spa: For security reasons, refusing to post the auth response.",
                            "If you want your app to be framable use sessionRestorationMethod: 'full page redirect'."
                        ].join(" ")
                    );
                }
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

            if (isPostLoginRedirectManual) {
                setOidcRequiredPostHydrationReplaceNavigationUrl({ rootRelativeRedirectUrl });
            } else {
                history.replaceState({}, "", rootRelativeRedirectUrl);
            }

            return { shouldLoadApp: true };
        }
        default:
            assert<Equals<typeof stateData, never>>(false);
    }
}
