import type { UserManager as OidcClientTsUserManager } from "../vendor/frontend/oidc-client-ts-and-jwt-decode";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { id, assert, type Equals } from "../vendor/frontend/tsafe";
import type { StateData } from "./StateData";

const GLOBAL_CONTEXT_KEY = "__oidc-spa.loginOrGoToAuthSever.globalContext";

declare global {
    interface Window {
        [GLOBAL_CONTEXT_KEY]: {
            hasLoginBeenCalled: boolean;
            URL_real: typeof URL;
        };
    }
}

window[GLOBAL_CONTEXT_KEY] ??= {
    hasLoginBeenCalled: false,
    URL_real: window.URL
};

const globalContext = window[GLOBAL_CONTEXT_KEY];

type Params = Params.Login | Params.GoToAuthServer;

namespace Params {
    type Common = {
        redirectUrl: string;
        extraQueryParams_local: Record<string, string> | undefined;
        transformUrlBeforeRedirect_local: ((url: string) => string) | undefined;
    };

    export type Login = Common & {
        action: "login";
        doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack: boolean;
        doForceReloadOnBfCache: boolean;
        doForceInteraction: boolean;
    };

    export type GoToAuthServer = Common & {
        action: "go to auth server";
    };
}

export function createLoginOrGoToAuthServer(params: {
    configId: string;
    oidcClientTsUserManager: OidcClientTsUserManager;
    getExtraQueryParams: (() => Record<string, string>) | undefined;
    transformUrlBeforeRedirect: ((url: string) => string) | undefined;
    homeAndCallbackUrl: string;
    log: typeof console.log | undefined;
}) {
    const {
        configId,
        oidcClientTsUserManager,
        getExtraQueryParams,
        transformUrlBeforeRedirect,
        homeAndCallbackUrl,
        log
    } = params;

    const LOCAL_STORAGE_KEY_TO_CLEAR_WHEN_RETURNING_OIDC_LOGGED_IN = `oidc-spa.login-redirect-initiated:${configId}`;

    let lastPublicUrl: string | undefined = undefined;

    async function loginOrGoToAuthServer(params: Params): Promise<never> {
        const {
            redirectUrl: redirectUrl_params,
            extraQueryParams_local,
            transformUrlBeforeRedirect_local,
            ...rest
        } = params;

        log?.("Calling loginOrGoToAuthServer", { params });

        login_specific_handling: {
            if (rest.action !== "login") {
                break login_specific_handling;
            }

            if (globalContext.hasLoginBeenCalled) {
                log?.("login() has already been called, ignoring the call");
                return new Promise<never>(() => {});
            }

            globalContext.hasLoginBeenCalled = true;

            bf_cache_handling: {
                if (rest.doForceReloadOnBfCache) {
                    document.removeEventListener("visibilitychange", () => {
                        if (document.visibilityState === "visible") {
                            location.reload();
                        }
                    });
                    break bf_cache_handling;
                }

                localStorage.setItem(LOCAL_STORAGE_KEY_TO_CLEAR_WHEN_RETURNING_OIDC_LOGGED_IN, "true");

                const callback = () => {
                    if (document.visibilityState === "visible") {
                        document.removeEventListener("visibilitychange", callback);

                        log?.(
                            "We came back from the login pages and the state of the app has been restored"
                        );

                        if (rest.doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack) {
                            if (lastPublicUrl !== undefined) {
                                log?.(`Loading last public route: ${lastPublicUrl}`);
                                window.location.href = lastPublicUrl;
                            } else {
                                log?.("We don't know the last public route, navigating back in history");
                                window.history.back();
                            }
                        } else {
                            log?.("The current page doesn't require auth...");

                            if (
                                localStorage.getItem(
                                    LOCAL_STORAGE_KEY_TO_CLEAR_WHEN_RETURNING_OIDC_LOGGED_IN
                                ) === null
                            ) {
                                log?.("but the user is now authenticated, reloading the page");
                                location.reload();
                            } else {
                                log?.(
                                    "and the user doesn't seem to be authenticated, avoiding a reload"
                                );
                                globalContext.hasLoginBeenCalled = false;
                            }
                        }
                    }
                };

                log?.("Start listening to visibility change event");

                document.addEventListener("visibilitychange", callback);
            }
        }

        const redirectUrl = toFullyQualifiedUrl({
            urlish: redirectUrl_params,
            doAssertNoQueryParams: false
        });

        log?.(`redirectUrl: ${redirectUrl}`);

        //NOTE: We know there is a extraQueryParameter option but it doesn't allow
        // to control the encoding so we have to highjack global URL Class that is
        // used internally by oidc-client-ts. It's save to do so since this is the
        // last thing that will be done before the redirect.
        {
            const { URL_real } = globalContext;

            const URL = (...args: ConstructorParameters<typeof URL_real>) => {
                const urlInstance = new URL_real(...args);

                return new Proxy(urlInstance, {
                    get: (target, prop) => {
                        if (prop === "href") {
                            Object.defineProperty(window, "URL", { value: URL_real });

                            let url = urlInstance.href;

                            (
                                [
                                    [getExtraQueryParams?.(), transformUrlBeforeRedirect],
                                    [extraQueryParams_local, transformUrlBeforeRedirect_local]
                                ] as const
                            ).forEach(([extraQueryParams, transformUrlBeforeRedirect]) => {
                                add_extra_query_params: {
                                    if (extraQueryParams === undefined) {
                                        break add_extra_query_params;
                                    }

                                    const url_obj = new URL_real(url);

                                    for (const [name, value] of Object.entries(extraQueryParams)) {
                                        url_obj.searchParams.set(name, value);
                                    }

                                    url = url_obj.href;
                                }

                                apply_transform_before_redirect: {
                                    if (transformUrlBeforeRedirect === undefined) {
                                        break apply_transform_before_redirect;
                                    }
                                    url = transformUrlBeforeRedirect(url);
                                }
                            });

                            return url;
                        }

                        //@ts-expect-error
                        return target[prop];
                    }
                });
            };

            Object.defineProperty(window, "URL", { value: URL });
        }

        const redirectMethod = (() => {
            switch (rest.action) {
                case "login":
                    return rest.doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack
                        ? "replace"
                        : "assign";
                case "go to auth server":
                    return "assign";
            }
        })();

        log?.(`redirectMethod: ${redirectMethod}`);

        const { extraQueryParams } = (() => {
            const extraQueryParams: Record<string, string> = extraQueryParams_local ?? {};

            read_query_params_added_by_transform_before_redirect: {
                if (transformUrlBeforeRedirect_local === undefined) {
                    break read_query_params_added_by_transform_before_redirect;
                }

                let url_afterTransform;

                try {
                    url_afterTransform = transformUrlBeforeRedirect_local("https://dummy.com");
                } catch {
                    break read_query_params_added_by_transform_before_redirect;
                }

                for (const [name, value] of new URL(url_afterTransform).searchParams) {
                    extraQueryParams[name] = value;
                }
            }

            return { extraQueryParams };
        })();

        await oidcClientTsUserManager.signinRedirect({
            state: id<StateData>({
                context: "redirect",
                redirectUrl,
                extraQueryParams,
                hasBeenProcessedByCallback: false,
                configId,
                action: "login",
                redirectUrl_consentRequiredCase: (() => {
                    switch (rest.action) {
                        case "login":
                            return lastPublicUrl ?? homeAndCallbackUrl;
                        case "go to auth server":
                            return redirectUrl;
                    }
                })()
            }),
            redirectMethod,
            prompt: (() => {
                switch (rest.action) {
                    case "go to auth server":
                        return undefined;
                    case "login":
                        return rest.doForceInteraction ? "consent" : undefined;
                }
                assert<Equals<typeof rest, never>>;
            })()
        });
        return new Promise<never>(() => {});
    }

    function toCallBeforeReturningOidcLoggedIn() {
        localStorage.removeItem(LOCAL_STORAGE_KEY_TO_CLEAR_WHEN_RETURNING_OIDC_LOGGED_IN);
    }

    function toCallBeforeReturningOidcNotLoggedIn() {
        const realPushState = history.pushState.bind(history);
        history.pushState = function pushState(...args) {
            lastPublicUrl = window.location.href;
            return realPushState(...args);
        };
    }

    return {
        loginOrGoToAuthServer,
        toCallBeforeReturningOidcLoggedIn,
        toCallBeforeReturningOidcNotLoggedIn
    };
}
