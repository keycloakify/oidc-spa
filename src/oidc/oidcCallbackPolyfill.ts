import { retrieveQueryParamFromUrl } from "../tools/urlQueryParams";
import { getStateData } from "./StateData";
import { getIsConfigHash } from "./configHash";

const BACK_NAVIGATION_TRACKER_KEY = "oidc-spa.has-navigated-back";

let previousCall:
    | {
          hasDedicatedHtmFile: boolean;
      }
    | undefined = undefined;

export function oidcCallbackPolyfill(params: { hasDedicatedHtmFile: boolean }): void | Promise<never> {
    const { hasDedicatedHtmFile } = params;

    {
        if (previousCall !== undefined) {
            if (previousCall.hasDedicatedHtmFile !== hasDedicatedHtmFile) {
                throw new Error(
                    "oidc-spa error, either all instance should use the silent-sso.htm file or none of them."
                );
            }
            return;
        }

        previousCall = { hasDedicatedHtmFile };
    }

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
        return;
    }

    const stateData = getStateData({ configHash: state, isCallbackContext: true });

    if (stateData === undefined) {
        // Here we are almost certain that we navigated back or forward to the callback page.
        // since we have a state and a code query param in the url.
        reloadOnRestore();

        if (sessionStorage.getItem(BACK_NAVIGATION_TRACKER_KEY) === "true") {
            sessionStorage.removeItem(BACK_NAVIGATION_TRACKER_KEY);
            history.forward();
        } else {
            sessionStorage.setItem(BACK_NAVIGATION_TRACKER_KEY, "true");
            history.back();
        }

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
        parent.postMessage(authResponse, location.origin);
    } else {
        reloadOnRestore();
        sessionStorage.removeItem(BACK_NAVIGATION_TRACKER_KEY);
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
