import {
    getStateData,
    markStateDataAsProcessedByCallback,
    getIsStatQueryParamValue,
    type StateData
} from "./StateData";
import { assert, id } from "../vendor/frontend/tsafe";
import type { AuthResponse } from "./AuthResponse";
import { initialLocationHref } from "./initialLocationHref";
import { captureFetch } from "./trustedFetch";
import { debug966975 } from "./debug966975";

captureFetch();

const globalContext = {
    previousCall: id<{ isHandled: boolean } | undefined>(undefined)
};

debug966975.log(
    `=================== Evaluating the handleOidcCallback file, isInIframe: ${
        window.self !== window.top ? "true" : "false"
    }, location.href: ${initialLocationHref}`
);

export function handleOidcCallback(): { isHandled: boolean } {
    if (globalContext.previousCall !== undefined) {
        debug966975.log(
            `handleOidcCallback() call, it has been called previously ${JSON.stringify(
                globalContext.previousCall
            )}`
        );
        return globalContext.previousCall;
    }

    return (globalContext.previousCall = handleOidcCallback_nonMemoized());
}

function handleOidcCallback_nonMemoized(): { isHandled: boolean } {
    debug966975.log(`In handleOidcCallback_nonMemoized()`);

    const location_urlObj = new URL(initialLocationHref);

    const stateQueryParamValue = (() => {
        const stateQueryParamValue = location_urlObj.searchParams.get("state");

        if (stateQueryParamValue === null) {
            debug966975.log("No state in url");
            return undefined;
        }

        if (!getIsStatQueryParamValue({ maybeStateQueryParamValue: stateQueryParamValue })) {
            debug966975.log(`State query param value ${stateQueryParamValue} is malformed`);
            return undefined;
        }

        if (
            location_urlObj.searchParams.get("client_id") !== null &&
            location_urlObj.searchParams.get("response_type") !== null &&
            location_urlObj.searchParams.get("redirect_uri") !== null
        ) {
            debug966975.log(
                "NOTE: We are probably in a Keycloakify theme and oidc-spa was loaded by mistake."
            );
            // NOTE: We are probably in a Keycloakify theme and oidc-spa was loaded by mistake.
            return undefined;
        }

        return stateQueryParamValue;
    })();

    debug966975.log(`state query param value ${stateQueryParamValue ?? "undefined"}`);

    if (stateQueryParamValue === undefined) {
        const backForwardTracker = readBackForwardTracker();

        debug966975.log(`backForwardTracker: ${JSON.stringify(backForwardTracker)}`);

        if (backForwardTracker !== undefined) {
            writeBackForwardTracker({
                backForwardTracker: {
                    ...backForwardTracker,
                    hasExitedCallback: true
                }
            });
        }

        debug966975.log("returning isHandled false");

        return { isHandled: false };
    }

    const isHandled = true;

    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    console.debug = () => {};

    const stateData = getStateData({ stateQueryParamValue });

    debug966975.log(`stateData: ${JSON.stringify(stateData)}`);

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

        debug966975.log(`historyMethod: ${historyMethod}`);

        writeBackForwardTracker({
            backForwardTracker: {
                previousHistoryMethod: historyMethod,
                hasExitedCallback: false
            }
        });

        reloadOnBfCacheNavigation();

        setTimeout(() => {
            debug966975.log(`(callback 0) Calling window.history.${historyMethod}()`);

            window.history[historyMethod]();
        }, 0);

        debug966975.log(`returning isHandled: ${isHandled ? "true" : "false"}`);

        return { isHandled };
    }

    const authResponse: AuthResponse = { state: "" };

    for (const [key, value] of location_urlObj.searchParams) {
        authResponse[key] = value;
    }

    assert(authResponse.state !== "", "063965");

    debug966975.log(`authResponse: ${JSON.stringify(authResponse)}`);

    switch (stateData.context) {
        case "iframe":
            setTimeout(() => {
                debug966975.log(`(callback 0) posting message to parent`);
                parent.postMessage(authResponse, location.origin);
            }, 0);
            break;
        case "redirect":
            markStateDataAsProcessedByCallback({ stateQueryParamValue });
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

                debug966975.log(`(callback 0) location.href = "${href}";`);

                location.href = href;
            }, 0);
            break;
    }

    debug966975.log(`Returning isHandled: ${isHandled ? "true" : "false"}`);

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

    debug966975.log(`>>> In retrieveRedirectAuthResponseAndStateData(${JSON.stringify({ configId })})`);

    const authResponses = readRedirectAuthResponses();

    debug966975.log(`authResponses: ${JSON.stringify(authResponses)}`);

    let authResponseAndStateData:
        | { authResponse: AuthResponse; stateData: StateData.Redirect }
        | undefined = undefined;

    for (const authResponse of [...authResponses]) {
        debug966975.log(`authResponse: ${JSON.stringify(authResponse)}`);

        const stateData = getStateData({ stateQueryParamValue: authResponse.state });

        debug966975.log(`stateDate: ${JSON.stringify(stateData)}`);

        try {
            assert(stateData !== undefined, "966975");
        } catch {
            authResponses.splice(authResponses.indexOf(authResponse), 1);
            debug966975.report();
            continue;
        }

        assert(stateData.context === "redirect", "474728");

        if (stateData.configId !== configId) {
            continue;
        }

        authResponses.splice(authResponses.indexOf(authResponse), 1);

        authResponseAndStateData = { authResponse, stateData };
    }

    if (authResponseAndStateData !== undefined) {
        debug966975.log(`writeRedirectAuthResponses(${JSON.stringify({ authResponses })})`);
        writeRedirectAuthResponses({ authResponses });
    }

    debug966975.log(`Returning ${JSON.stringify({ authResponseAndStateData })} <<<<<<<<<`);

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
