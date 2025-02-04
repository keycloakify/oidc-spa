import { retrieveQueryParamFromUrl } from "../tools/urlQueryParams";
import { getStateData } from "./StateData";
import { getIsConfigHash } from "./configHash";

const log: typeof console.log = (...args) => {
    console.log(...["oidcCallbackPolyfill", ...args]);
};

let previousCall:
    | {
          hasDedicatedHtmFile: boolean;
          prOut: Promise<void | never>;
      }
    | undefined = undefined;

export function handleOidcCallbackIfApplicable(params: {
    hasDedicatedHtmFile: boolean;
}): Promise<void | never> {
    const { hasDedicatedHtmFile } = params;

    if (previousCall !== undefined) {
        if (previousCall.hasDedicatedHtmFile !== hasDedicatedHtmFile) {
            throw new Error(
                "oidc-spa error, either all instance should use the silent-sso.htm file or none of them."
            );
        }
        log("Cancel, already called");
        return previousCall.prOut;
    }

    const prOut = handleOidcCallbackIfApplicable_nonMemoized({ hasDedicatedHtmFile });

    previousCall = {
        hasDedicatedHtmFile,
        prOut
    };

    return prOut;
}

async function handleOidcCallbackIfApplicable_nonMemoized(params: {
    hasDedicatedHtmFile: boolean;
}): Promise<void | never> {
    const { hasDedicatedHtmFile } = params;

    log("start");

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
        log("this is not a callback page");

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
        log(
            "back forward navigation",
            JSON.stringify(Object.fromEntries(new URL(window.location.href).searchParams), null, 2)
        );

        // Here we are almost certain that we navigated back or forward to the callback page.
        // since we have a state and a code query param in the url.
        reloadOnRestore();

        const historyMethod: "back" | "forward" = (() => {
            const backForwardTracker = readBackForwardTracker();

            log("backForwardTracker", backForwardTracker);

            if (backForwardTracker === undefined) {
                return "back";
            }

            if (!backForwardTracker.hasExitedCallback) {
                log("same!!");
                return backForwardTracker.previousHistoryMethod;
            }

            log("different!!");

            switch (backForwardTracker.previousHistoryMethod) {
                case "back":
                    return "forward";
                case "forward":
                    return "back";
            }
        })();

        log("historyMethod", historyMethod);

        writeBackForwardTracker({
            backForwardTracker: {
                previousHistoryMethod: historyMethod,
                hasExitedCallback: false
            }
        });

        window.history[historyMethod]();

        return new Promise<never>(() => {});
    }

    if (hasDedicatedHtmFile) {
        // Here the user forget to create the silent-sso.htm file or or the web server is not serving it correctly
        // we shouldn't fall back to the SPA page.
        // In this case we want to let the timeout of the parent expire to provide the correct error message.
        return new Promise<never>(() => {});
    }

    const authResponse: Record<string, string> = {};

    for (const [key, value] of new URL(location.href).searchParams) {
        authResponse[key] = value;
    }

    if (stateData.isSilentSso) {
        log("silent sso", JSON.stringify(authResponse, null, 2));
        parent.postMessage(authResponse, location.origin);
    } else {
        log("handle redirect", JSON.stringify(authResponse, null, 2));
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
            log("bfcache restore!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
            alert("bfcache restore");
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
