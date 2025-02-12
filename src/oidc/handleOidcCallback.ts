import { retrieveQueryParamFromUrl } from "../tools/urlQueryParams";
import { getStateData, markStateDataAsProcessedByCallback, getIsStatQueryParamValue } from "./StateData";

declare global {
    interface Window {
        "__oidc-spa.handleOidcCallback.previousCall": Promise<void | never> | undefined;
    }
}

export function handleOidcCallback(): Promise<void | never> {
    if (window["__oidc-spa.handleOidcCallback.previousCall"] !== undefined) {
        return window["__oidc-spa.handleOidcCallback.previousCall"];
    }
    return (window["__oidc-spa.handleOidcCallback.previousCall"] = handleOidcCallback_nonMemoized());
}

export const AUTH_RESPONSE_KEY = "oidc-spa.authResponse";

async function handleOidcCallback_nonMemoized(): Promise<void | never> {
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

        return;
    }

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

        return new Promise<never>(() => {});
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

    return new Promise<never>(() => {});
}

function reloadOnRestore() {
    const listener = () => {
        if (document.visibilityState === "visible") {
            document.removeEventListener("visibilitychange", listener);
            location.reload();
        }
    };
    document.addEventListener("visibilitychange", listener);
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
