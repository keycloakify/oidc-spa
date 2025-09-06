import {
    getStateData,
    markStateDataAsProcessedByCallback,
    getIsStatQueryParamValue,
    type StateData
} from "./StateData";
import { assert, id } from "../vendor/frontend/tsafe";
import type { AuthResponse } from "./AuthResponse";
import { initialLocationHref } from "./initialLocationHref";
import { encryptAuthResponse } from "./iframeMessageProtection";

const globalContext = {
    previousCall: id<{ isHandled: boolean } | undefined>(undefined)
};

export function handleOidcCallback(): { isHandled: boolean } {
    if (globalContext.previousCall !== undefined) {
        return globalContext.previousCall;
    }

    return (globalContext.previousCall = handleOidcCallback_nonMemoized());
}

function handleOidcCallback_nonMemoized(): { isHandled: boolean } {
    const location_urlObj = new URL(initialLocationHref);

    const stateUrlParamValue_wrap = (() => {
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

            return { stateUrlParamValue, isFragment: true };
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

            return { stateUrlParamValue, isFragment: false };
        }

        return undefined;
    })();

    if (stateUrlParamValue_wrap === undefined) {
        const backForwardTracker = readBackForwardTracker();

        if (backForwardTracker !== undefined) {
            writeBackForwardTracker({
                backForwardTracker: {
                    ...backForwardTracker,
                    hasExitedCallback: true
                }
            });
        }

        return { isHandled: false };
    }

    const isHandled = true;

    const { stateUrlParamValue, isFragment } = stateUrlParamValue_wrap;

    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    console.debug = () => {};

    const stateData = getStateData({ stateUrlParamValue });

    if (
        stateData === undefined ||
        (stateData.context === "redirect" && stateData.hasBeenProcessedByCallback)
    ) {
        const historyMethod: "back" | "forward" = (() => {
            const backForwardTracker = readBackForwardTracker();

            if (backForwardTracker === undefined) {
                return "back";
            }

            if (!backForwardTracker.hasExitedCallback) {
                return backForwardTracker.previousHistoryMethod;
            }

            switch (backForwardTracker.previousHistoryMethod) {
                case "back":
                    return "forward";
                case "forward":
                    return "back";
            }
        })();

        writeBackForwardTracker({
            backForwardTracker: {
                previousHistoryMethod: historyMethod,
                hasExitedCallback: false
            }
        });

        setTimeout(() => {
            reloadOnBfCacheNavigation();

            window.history[historyMethod]();

            // NOTE: This is a "better than nothing" approach.
            // Under some circumstances it's possible to get stuck on this url
            // if there is no "next" page in the history for example, navigating
            // forward is a NoOp. So in that case it's better to reload the same route
            // with just the authResponse removed from the url to avoid re-entering here.
            setTimeout(() => {
                const { protocol, host, pathname, hash } = window.location;
                window.location.href = `${protocol}//${host}${pathname}${hash}`;
            }, 350);
        }, 0);

        return { isHandled };
    }

    const authResponse: AuthResponse = { state: "" };

    for (const [key, value] of isFragment
        ? new URLSearchParams(location_urlObj.hash.replace(/^#/, ""))
        : location_urlObj.searchParams) {
        authResponse[key] = value;
    }

    assert(authResponse.state !== "", "063965");

    switch (stateData.context) {
        case "iframe":
            encryptAuthResponse({
                authResponse
            }).then(({ encryptedMessage }) => parent.postMessage(encryptedMessage, location.origin));
            break;
        case "redirect":
            markStateDataAsProcessedByCallback({ stateUrlParamValue });
            clearBackForwardTracker();
            writeRedirectAuthResponses({
                authResponses: [...readRedirectAuthResponses(), authResponse]
            });
            reloadOnBfCacheNavigation();
            setTimeout(() => {
                const href = (() => {
                    if (stateData.action === "login" && authResponse.error === "consent_required") {
                        return stateData.redirectUrl_consentRequiredCase;
                    }

                    return stateData.redirectUrl;
                })();

                location.href = href;
            }, 0);
            break;
    }

    return { isHandled };
}

const {
    readRedirectAuthResponses,
    writeRedirectAuthResponses,
    moveRedirectAuthResponseFromSessionStorageToMemory
} = (() => {
    const AUTH_RESPONSES_KEY = "oidc-spa:authResponses";

    let authResponses_movedToMemoryFromSessionStorage: AuthResponse[] | undefined = undefined;

    // NOTE: Here we note that we can re-write on session storage some auth response
    // after earlyInit in retrieveRedirectAuthResponseAndStateData
    // In situation where there are more than one client in the same app and we can't use iframe,
    // we can have one client that has to redirect before the response has been dealt with.
    // In most case it won't happen if the init sequence is deterministic but the client
    // can be instantiated at any time really.
    // So the move to memory of the response is fully effective only when theres one client.
    function writeRedirectAuthResponses(params: { authResponses: AuthResponse[] }): void {
        const { authResponses } = params;

        authResponses_movedToMemoryFromSessionStorage = undefined;

        if (authResponses.length === 0) {
            sessionStorage.removeItem(AUTH_RESPONSES_KEY);
            return;
        }
        sessionStorage.setItem(AUTH_RESPONSES_KEY, JSON.stringify(authResponses));
    }

    function readRedirectAuthResponses(): AuthResponse[] {
        if (authResponses_movedToMemoryFromSessionStorage !== undefined) {
            return authResponses_movedToMemoryFromSessionStorage;
        }

        const raw = sessionStorage.getItem(AUTH_RESPONSES_KEY);

        if (raw === null) {
            return [];
        }

        return JSON.parse(raw);
    }

    function moveRedirectAuthResponseFromSessionStorageToMemory() {
        const authResponses = readRedirectAuthResponses();

        writeRedirectAuthResponses({ authResponses: [] });

        authResponses_movedToMemoryFromSessionStorage = authResponses;
    }

    return {
        writeRedirectAuthResponses,
        readRedirectAuthResponses,
        moveRedirectAuthResponseFromSessionStorageToMemory
    };
})();

export { moveRedirectAuthResponseFromSessionStorageToMemory };

export function retrieveRedirectAuthResponseAndStateData(params: {
    configId: string;
}): { authResponse: AuthResponse; stateData: StateData.Redirect } | undefined {
    const { configId } = params;

    const authResponses = readRedirectAuthResponses();

    let authResponseAndStateData:
        | { authResponse: AuthResponse; stateData: StateData.Redirect }
        | undefined = undefined;

    for (const authResponse of [...authResponses]) {
        const stateData = getStateData({ stateUrlParamValue: authResponse.state });

        if (stateData === undefined) {
            // NOTE: We do not understand how this can happen but it can.
            authResponses.splice(authResponses.indexOf(authResponse), 1);
            continue;
        }

        assert(stateData.context === "redirect", "474728");

        if (stateData.configId !== configId) {
            continue;
        }

        authResponses.splice(authResponses.indexOf(authResponse), 1);

        authResponseAndStateData = { authResponse, stateData };
    }

    writeRedirectAuthResponses({ authResponses });

    return authResponseAndStateData;
}

function reloadOnBfCacheNavigation() {
    const start = Date.now();
    window.addEventListener("pageshow", () => {
        const elapsed = Date.now() - start;

        if (elapsed < 100) {
            return;
        }
        location.reload();
    });
}

const { writeBackForwardTracker, readBackForwardTracker, clearBackForwardTracker } = (() => {
    const BACK_NAVIGATION_TRACKER_KEY = "oidc-spa:callback-back-forward-tracker";

    type BackForwardTracker = {
        previousHistoryMethod: "back" | "forward";
        hasExitedCallback: boolean;
    };

    function writeBackForwardTracker(params: { backForwardTracker: BackForwardTracker }): void {
        const { backForwardTracker } = params;

        sessionStorage.setItem(BACK_NAVIGATION_TRACKER_KEY, JSON.stringify(backForwardTracker));
    }

    function readBackForwardTracker(): BackForwardTracker | undefined {
        const raw = sessionStorage.getItem(BACK_NAVIGATION_TRACKER_KEY);

        if (raw === null) {
            return undefined;
        }

        return JSON.parse(raw);
    }

    function clearBackForwardTracker(): void {
        sessionStorage.removeItem(BACK_NAVIGATION_TRACKER_KEY);
    }

    return { writeBackForwardTracker, readBackForwardTracker, clearBackForwardTracker };
})();
