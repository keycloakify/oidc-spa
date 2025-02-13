import { retrieveQueryParamFromUrl } from "../tools/urlQueryParams";
import { getStateData, markStateDataAsProcessedByCallback, getIsStatQueryParamValue } from "./StateData";

declare global {
    interface Window {
        "__oidc-spa.handleOidcCallback.globalContext": {
            previousCall: { isHandled: boolean } | undefined;
        };
    }
}

window["__oidc-spa.handleOidcCallback.globalContext"] ??= {
    previousCall: undefined
};

const globalContext = window["__oidc-spa.handleOidcCallback.globalContext"];

export function handleOidcCallback(): { isHandled: boolean } {
    if (globalContext.previousCall !== undefined) {
        return globalContext.previousCall;
    }

    return (globalContext.previousCall = handleOidcCallback_nonMemoized());
}

export const AUTH_RESPONSE_KEY = "oidc-spa.authResponse";

function handleOidcCallback_nonMemoized(): { isHandled: boolean } {
    const stateQueryParamValue = (() => {
        const result = retrieveQueryParamFromUrl({
            url: window.location.href,
            name: "state"
        });

        if (!result.wasPresent) {
            return undefined;
        }

        if (!getIsStatQueryParamValue({ maybeStateQueryParamValue: result.value })) {
            return undefined;
        }

        return result.value;
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
        reloadOnRestore();

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

        window.history[historyMethod]();

        return { isHandled };
    }

    const authResponse: Record<string, string> = {};

    for (const [key, value] of new URL(location.href).searchParams) {
        authResponse[key] = value;
    }

    switch (stateData.context) {
        case "iframe":
            parent.postMessage(authResponse, location.origin);
            break;
        case "redirect":
            reloadOnRestore();
            markStateDataAsProcessedByCallback({ stateQueryParamValue });
            clearBackForwardTracker();
            sessionStorage.setItem(AUTH_RESPONSE_KEY, JSON.stringify(authResponse));
            location.href = stateData.redirectUrl;
            break;
    }

    return { isHandled };
}

function reloadOnRestore() {
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            location.reload();
        }
    });
}

const { writeBackForwardTracker, readBackForwardTracker, clearBackForwardTracker } = (() => {
    const BACK_NAVIGATION_TRACKER_KEY = "oidc-spa.callback-back-forward-tracker";

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
