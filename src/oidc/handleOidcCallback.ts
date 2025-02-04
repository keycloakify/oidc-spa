import { retrieveQueryParamFromUrl } from "../tools/urlQueryParams";
import { getStateData } from "./StateData";
import { getIsConfigHash } from "./configHash";

let previousCall: Promise<void | never> | undefined = undefined;

export function handleOidcCallbackIfApplicable(): Promise<void | never> {
    if (previousCall !== undefined) {
        return previousCall;
    }

    return (previousCall = handleOidcCallbackIfApplicable_nonMemoized());
}

async function handleOidcCallbackIfApplicable_nonMemoized(): Promise<void | never> {
    const state = (() => {
        const result = retrieveQueryParamFromUrl({
            url: window.location.href,
            name: "state"
        });

        if (!result.wasPresent) {
            return undefined;
        }

        if (!getIsConfigHash({ maybeConfigHash: result.value })) {
            return undefined;
        }

        return result.value;
    })();

    if (state === undefined) {
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

    const stateData = getStateData({ configHash: state, isCallbackContext: true });

    if (stateData === undefined) {
        // Here we are almost certain that we navigated back or forward to the callback page.
        // since we have a state and a code query param in the url.
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

    if (stateData.isSilentSso) {
        parent.postMessage(authResponse, location.origin);
    } else {
        reloadOnRestore();
        clearBackForwardTracker();
        sessionStorage.setItem("oidc-spa.authResponse", JSON.stringify(authResponse));
        location.href = stateData.redirectUrl;
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
