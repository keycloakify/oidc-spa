import {
    getStateData,
    markStateDataAsProcessedByCallback,
    getIsStatQueryParamValue,
    type StateData
} from "./StateData";
import { assert, id } from "../vendor/frontend/tsafe";
import type { AuthResponse } from "./AuthResponse";
import { initialLocationHref } from "./initialLocationHref";

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

    const stateQueryParamValue = (() => {
        const stateQueryParamValue = location_urlObj.searchParams.get("state");

        if (stateQueryParamValue === null) {
            return undefined;
        }

        if (!getIsStatQueryParamValue({ maybeStateQueryParamValue: stateQueryParamValue })) {
            return undefined;
        }

        if (
            location_urlObj.searchParams.get("client_id") !== null &&
            location_urlObj.searchParams.get("response_type") !== null &&
            location_urlObj.searchParams.get("redirect_uri") !== null
        ) {
            // NOTE: We are probably in a Keycloakify theme and oidc-spa was loaded by mistake.
            return undefined;
        }

        return stateQueryParamValue;
    })();

    if (stateQueryParamValue === undefined) {
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

    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    console.debug = () => {};

    const stateData = getStateData({ stateQueryParamValue });

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

        reloadOnBfCacheNavigation();

        window.history[historyMethod]();

        return { isHandled };
    }

    const authResponse: AuthResponse = { state: "" };

    for (const [key, value] of location_urlObj.searchParams) {
        authResponse[key] = value;
    }

    assert(authResponse.state !== "");

    switch (stateData.context) {
        case "iframe":
            parent.postMessage(authResponse, location.origin);
            break;
        case "redirect":
            markStateDataAsProcessedByCallback({ stateQueryParamValue });
            clearBackForwardTracker();
            writeRedirectAuthResponses({
                authResponses: [...readRedirectAuthResponses(), authResponse]
            });
            reloadOnBfCacheNavigation();
            location.href = (() => {
                if (stateData.action === "login" && authResponse.error === "consent_required") {
                    return stateData.redirectUrl_consentRequiredCase;
                }

                return stateData.redirectUrl;
            })();
            break;
    }

    return { isHandled };
}

const { readRedirectAuthResponses, writeRedirectAuthResponses } = (() => {
    const AUTH_RESPONSES_KEY = "oidc-spa:authResponses";

    function writeRedirectAuthResponses(params: { authResponses: AuthResponse[] }): void {
        const { authResponses } = params;
        if (authResponses.length === 0) {
            sessionStorage.removeItem(AUTH_RESPONSES_KEY);
            return;
        }
        sessionStorage.setItem(AUTH_RESPONSES_KEY, JSON.stringify(authResponses));
    }

    function readRedirectAuthResponses(): AuthResponse[] {
        const raw = sessionStorage.getItem(AUTH_RESPONSES_KEY);

        if (raw === null) {
            return [];
        }

        return JSON.parse(raw);
    }

    return { writeRedirectAuthResponses, readRedirectAuthResponses };
})();

export function retrieveRedirectAuthResponseAndStateData(params: {
    configId: string;
}): { authResponse: AuthResponse; stateData: StateData.Redirect } | undefined {
    const { configId } = params;

    const authResponses = readRedirectAuthResponses();

    let authResponseAndStateData:
        | { authResponse: AuthResponse; stateData: StateData.Redirect }
        | undefined = undefined;

    for (const authResponse of [...authResponses]) {
        const stateData = getStateData({ stateQueryParamValue: authResponse.state });

        assert(stateData !== undefined);
        assert(stateData.context === "redirect");

        if (stateData.configId !== configId) {
            continue;
        }

        authResponses.splice(authResponses.indexOf(authResponse), 1);

        authResponseAndStateData = { authResponse, stateData };
    }

    if (authResponseAndStateData !== undefined) {
        writeRedirectAuthResponses({ authResponses });
    }

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
