import { getStateData, getIsStatQueryParamValue } from "./StateData";
import { assert, type Equals } from "../tools/tsafe/assert";
import type { AuthResponse } from "./AuthResponse";
import {
    encryptAuthResponse,
    preventSessionStorageSetItemOfPublicKeyByThirdParty
} from "./iframeMessageProtection";
import { setOidcRequiredPostHydrationReplaceNavigationUrl } from "./requiredPostHydrationReplaceNavigationUrl";

let hasEarlyInitBeenCalled = false;

export function oidcEarlyInit(params: {
    freezeFetch: boolean;
    freezeXMLHttpRequest: boolean;
    // NOTE: Made optional just to avoid breaking change.
    // Will be made mandatory next major.
    freezeWebSocket?: boolean;
    isPostLoginRedirectManual?: boolean;
}) {
    if (hasEarlyInitBeenCalled) {
        throw new Error("oidc-spa: oidcEarlyInit() Should be called only once");
    }

    hasEarlyInitBeenCalled = true;

    const {
        freezeFetch,
        freezeXMLHttpRequest,
        freezeWebSocket = false,
        isPostLoginRedirectManual = false
    } = params ?? {};

    const { shouldLoadApp } = handleOidcCallback({ isPostLoginRedirectManual });

    if (shouldLoadApp) {
        if (freezeXMLHttpRequest) {
            const XMLHttpRequest_trusted = globalThis.XMLHttpRequest;

            Object.freeze(XMLHttpRequest_trusted.prototype);
            Object.freeze(XMLHttpRequest_trusted);

            Object.defineProperty(globalThis, "XMLHttpRequest", {
                configurable: false,
                writable: false,
                enumerable: true,
                value: XMLHttpRequest_trusted
            });
        }

        if (freezeFetch) {
            const fetch_trusted = globalThis.fetch;

            Object.freeze(fetch_trusted);

            Object.defineProperty(globalThis, "fetch", {
                configurable: false,
                writable: false,
                enumerable: true,
                value: fetch_trusted
            });
        }

        if (freezeWebSocket) {
            const WebSocket_trusted = globalThis.WebSocket;

            Object.freeze(WebSocket_trusted.prototype);
            Object.freeze(WebSocket_trusted);

            Object.defineProperty(globalThis, "WebSocket", {
                configurable: false,
                writable: false,
                enumerable: true,
                value: WebSocket_trusted
            });
        }

        preventSessionStorageSetItemOfPublicKeyByThirdParty();
    }

    return { shouldLoadApp };
}

let redirectAuthResponse: AuthResponse | undefined = undefined;

export function getRedirectAuthResponse():
    | { authResponse: AuthResponse; clearAuthResponse: () => void }
    | { authResponse: undefined; clearAuthResponse?: never } {
    if (!hasEarlyInitBeenCalled) {
        throw new Error(
            [
                "oidc-spa setup error.",
                "oidcEarlyInit() wasn't called.",
                "In newer version, using oidc-spa/entrypoint is no longer optional."
            ].join(" ")
        );
    }
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
            encryptAuthResponse({
                authResponse
            }).then(({ encryptedMessage }) => parent.postMessage(encryptedMessage, location.origin));
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
