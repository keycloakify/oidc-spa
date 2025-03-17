import type { UserManager as OidcClientTsUserManager } from "../vendor/frontend/oidc-client-ts-and-jwt-decode";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { assert, type Equals, noUndefined } from "../vendor/frontend/tsafe";
import { StateData } from "./StateData";
import type { NonPostableEvt } from "../tools/Evt";
import { createStatefulEvt } from "../tools/StatefulEvt";
import { Deferred } from "../tools/Deferred";
import { addOrUpdateSearchParam, getAllSearchParams } from "../tools/urlSearchParams";

const globalContext = {
    evtHasLoginBeenCalled: createStatefulEvt(() => false)
};

type Params = Params.Login | Params.GoToAuthServer;

namespace Params {
    type Common = {
        redirectUrl: string;
        extraQueryParams_local: Record<string, string | undefined> | undefined;
        transformUrlBeforeRedirect_local: ((url: string) => string) | undefined;
    };

    export type Login = Common & {
        action: "login";
        doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack: boolean;
        doForceReloadOnBfCache: boolean;
        interaction:
            | "ensure no interaction"
            | "ensure interaction"
            | "directly redirect if active session show login otherwise";
    };

    export type GoToAuthServer = Common & {
        action: "go to auth server";
    };
}

export function getPrSafelyRestoredFromBfCacheAfterLoginBackNavigation() {
    const dOut = new Deferred<void>();

    const { unsubscribe } = globalContext.evtHasLoginBeenCalled.subscribe(hasLoginBeenCalled => {
        if (!hasLoginBeenCalled) {
            unsubscribe();
            dOut.resolve();
        }
    });

    return dOut.pr;
}

export function createLoginOrGoToAuthServer(params: {
    configId: string;
    oidcClientTsUserManager: OidcClientTsUserManager;
    transformUrlBeforeRedirect: ((url: string) => string) | undefined;
    transformUrlBeforeRedirect_next:
        | ((params: { authorizationUrl: string; isSilent: boolean }) => string)
        | undefined;

    getExtraQueryParams:
        | ((params: { isSilent: boolean; url: string }) => Record<string, string | undefined>)
        | undefined;

    getExtraTokenParams: (() => Record<string, string | undefined>) | undefined;

    homeAndCallbackUrl: string;
    evtIsUserLoggedIn: NonPostableEvt<boolean>;
    log: typeof console.log | undefined;
}) {
    const {
        configId,
        oidcClientTsUserManager,

        transformUrlBeforeRedirect,
        transformUrlBeforeRedirect_next,
        getExtraQueryParams,

        getExtraTokenParams,

        homeAndCallbackUrl,
        evtIsUserLoggedIn,
        log
    } = params;

    const LOCAL_STORAGE_KEY_TO_CLEAR_WHEN_USER_LOGGED_IN = `oidc-spa.login-redirect-initiated:${configId}`;

    let lastPublicUrl: string | undefined = undefined;

    function loginOrGoToAuthServer(params: Params): Promise<never> {
        const {
            redirectUrl: redirectUrl_params,
            extraQueryParams_local,
            transformUrlBeforeRedirect_local: transformUrl,
            ...rest
        } = params;

        log?.(`Calling loginOrGoToAuthServer ${JSON.stringify(params, null, 2)}`);

        login_specific_handling: {
            if (rest.action !== "login") {
                break login_specific_handling;
            }

            if (globalContext.evtHasLoginBeenCalled.current) {
                log?.("login() has already been called, ignoring the call");
                return new Promise<never>(() => {});
            }

            globalContext.evtHasLoginBeenCalled.current = true;

            bf_cache_handling: {
                if (rest.doForceReloadOnBfCache) {
                    window.removeEventListener("pageshow", () => {
                        location.reload();
                    });
                    break bf_cache_handling;
                }

                localStorage.setItem(LOCAL_STORAGE_KEY_TO_CLEAR_WHEN_USER_LOGGED_IN, "true");

                const callback = () => {
                    window.removeEventListener("pageshow", callback);

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
                            localStorage.getItem(LOCAL_STORAGE_KEY_TO_CLEAR_WHEN_USER_LOGGED_IN) === null
                        ) {
                            log?.("but the user is now authenticated, reloading the page");
                            location.reload();
                        } else {
                            log?.("and the user doesn't seem to be authenticated, avoiding a reload");
                            globalContext.evtHasLoginBeenCalled.current = false;
                        }
                    }
                };

                window.addEventListener("pageshow", callback);
            }
        }

        const redirectUrl = toFullyQualifiedUrl({
            urlish: redirectUrl_params,
            doAssertNoQueryParams: false
        });

        log?.(`redirectUrl: ${redirectUrl}`);

        const stateData: StateData = {
            context: "redirect",
            redirectUrl,
            extraQueryParams: {},
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
        };

        const isSilent = rest.action === "login" && rest.interaction === "ensure no interaction";

        const transformUrl_oidcClientTs = (url: string) => {
            (
                [
                    [
                        undefined,
                        transformUrlBeforeRedirect_next === undefined
                            ? undefined
                            : (url: string) =>
                                  transformUrlBeforeRedirect_next({
                                      isSilent,
                                      authorizationUrl: url
                                  })
                    ],
                    [getExtraQueryParams, transformUrlBeforeRedirect],
                    [extraQueryParams_local, transformUrl]
                ] as const
            ).forEach(([extraQueryParamsMaybeGetter, transformUrlBeforeRedirect], i) => {
                const url_before = i !== 2 ? undefined : url;

                add_extra_query_params: {
                    if (extraQueryParamsMaybeGetter === undefined) {
                        break add_extra_query_params;
                    }

                    const extraQueryParams =
                        typeof extraQueryParamsMaybeGetter === "function"
                            ? extraQueryParamsMaybeGetter({ isSilent, url })
                            : extraQueryParamsMaybeGetter;

                    for (const [name, value] of Object.entries(extraQueryParams)) {
                        if (value === undefined) {
                            continue;
                        }
                        url = addOrUpdateSearchParam({
                            url,
                            name,
                            value,
                            encodeMethod: "www-form"
                        });
                    }
                }

                apply_transform_url: {
                    if (transformUrlBeforeRedirect === undefined) {
                        break apply_transform_url;
                    }
                    url = transformUrlBeforeRedirect(url);
                }

                update_state: {
                    if (url_before === undefined) {
                        break update_state;
                    }

                    const paramValueByName_current = getAllSearchParams(url);
                    const paramValueByName_before = getAllSearchParams(url_before);

                    for (const [name, value_current] of Object.entries(paramValueByName_current)) {
                        const value_before: string | undefined = paramValueByName_before[name];

                        if (value_before === value_current) {
                            continue;
                        }

                        stateData.extraQueryParams[name] = value_current;
                    }
                }
            });

            return url;
        };

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

        return oidcClientTsUserManager
            .signinRedirect({
                state: stateData,
                redirectMethod,
                prompt: (() => {
                    switch (rest.action) {
                        case "go to auth server":
                            return undefined;
                        case "login":
                            switch (rest.interaction) {
                                case "ensure no interaction":
                                    return "none";
                                case "ensure interaction":
                                    return "prompt";
                                case "directly redirect if active session show login otherwise":
                                    return undefined;
                            }
                            assert<Equals<typeof rest.interaction, never>>;
                    }
                    assert<Equals<typeof rest, never>>;
                })(),
                transformUrl: transformUrl_oidcClientTs,
                extraTokenParams:
                    getExtraTokenParams === undefined ? undefined : noUndefined(getExtraTokenParams())
            })
            .then(() => new Promise<never>(() => {}));
    }

    const { unsubscribe } = evtIsUserLoggedIn.subscribe(isLoggedIn => {
        unsubscribe();

        if (isLoggedIn) {
            localStorage.removeItem(LOCAL_STORAGE_KEY_TO_CLEAR_WHEN_USER_LOGGED_IN);
        } else {
            const realPushState = history.pushState.bind(history);
            history.pushState = function pushState(...args) {
                lastPublicUrl = window.location.href;
                return realPushState(...args);
            };
        }
    });

    return {
        loginOrGoToAuthServer
    };
}
