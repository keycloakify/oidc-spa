import type { UserManager as OidcClientTsUserManager } from "../vendor/frontend/oidc-client-ts";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { assert, type Equals } from "../tools/tsafe/assert";
import { noUndefined } from "../tools/tsafe/noUndefined";
import type { StateData } from "./StateData";
import type { NonPostableEvt } from "../tools/Evt";
import { createStatefulEvt } from "../tools/StatefulEvt";
import { Deferred } from "../tools/Deferred";
import { addOrUpdateSearchParam, getAllSearchParams } from "../tools/urlSearchParams";
import { getIsOnline } from "../tools/getIsOnline";

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
        preRedirectHook: (() => void) | undefined;
    };

    export type GoToAuthServer = Common & {
        action: "go to auth server";
    };
}

export function getPrSafelyRestoredFromBfCacheAfterLoginBackNavigationOrInitializationError() {
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
    transformUrlBeforeRedirect:
        | ((params: { authorizationUrl: string; isSilent: boolean }) => string)
        | undefined;

    getExtraQueryParams:
        | ((params: { isSilent: boolean; url: string }) => Record<string, string | undefined>)
        | undefined;

    getExtraTokenParams: (() => Record<string, string | undefined>) | undefined;

    homeUrl: string;
    evtInitializationOutcomeUserNotLoggedIn: NonPostableEvt<void>;
    log: typeof console.log | undefined;
}) {
    const {
        configId,
        oidcClientTsUserManager,

        transformUrlBeforeRedirect,
        getExtraQueryParams,

        getExtraTokenParams,

        homeUrl,
        evtInitializationOutcomeUserNotLoggedIn,

        log
    } = params;

    let lastPublicUrl: string | undefined = undefined;

    async function loginOrGoToAuthServer(params: Params): Promise<never> {
        const {
            redirectUrl: redirectUrl_params,
            extraQueryParams_local,
            transformUrlBeforeRedirect_local,
            ...rest
        } = params;

        log?.(`Calling loginOrGoToAuthServer ${JSON.stringify(params, null, 2)}`);

        delay_until_online: {
            const { isOnline, prOnline } = getIsOnline();
            if (isOnline) {
                break delay_until_online;
            }
            log?.(
                "The browser seem offline, waiting to get back a connection before proceeding to login"
            );
            await prOnline;
        }

        login_specific_handling: {
            if (rest.action !== "login") {
                break login_specific_handling;
            }

            if (globalContext.evtHasLoginBeenCalled.current) {
                log?.("login() has already been called, ignoring the call");
                return new Promise<never>(() => {});
            }

            globalContext.evtHasLoginBeenCalled.current = true;

            if (document.visibilityState !== "visible") {
                rest.interaction === "ensure no interaction";

                const dVisible = new Deferred<void>();

                const onVisible = () => {
                    if (document.visibilityState !== "visible") {
                        return;
                    }
                    document.removeEventListener("visibilitychange", onVisible);
                    dVisible.resolve();
                };
                document.addEventListener("visibilitychange", onVisible);

                await dVisible.pr;
            }

            bf_cache_handling: {
                if (rest.doForceReloadOnBfCache) {
                    const callback = (event: { persisted: boolean }) => {
                        if (!event.persisted) {
                            return;
                        }
                        location.reload();
                    };

                    window.addEventListener("pageshow", callback);
                    break bf_cache_handling;
                }

                const callback = (event: { persisted: boolean }) => {
                    if (!event.persisted) {
                        return;
                    }

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
                        // NOTE: We know the user is not logged in because login can only be called when not logged in.
                        log?.("The current page doesn't require auth, avoiding reloading the page");
                        globalContext.evtHasLoginBeenCalled.current = false;
                    }
                };

                window.addEventListener("pageshow", callback);
            }
        }

        const redirectUrl = toFullyQualifiedUrl({
            urlish: redirectUrl_params,
            doAssertNoQueryParams: false
        });

        {
            const redirectUrl_obj = new URL(redirectUrl);
            const redirectUrl_originAndPath = `${redirectUrl_obj.origin}${redirectUrl_obj.pathname}`;

            if (!redirectUrl_originAndPath.replace(/\/?$/, "/").startsWith(homeUrl)) {
                throw new Error(
                    [
                        `oidc-spa: redirect target ${redirectUrl_originAndPath} is outside of your application.`,
                        `The homeUrl that you have provided defines the root where your app is hosted: ${homeUrl}.\n`,
                        `This usually means one of the following:\n`,
                        `1) The homeUrl is not set correctly. It must be the actual hosting root (for Vite, typically \`import.meta.env.BASE_URL\`).\n`,
                        `2) You are trying to redirect outside of your application, which is not allowed by OIDC.`
                    ].join(" ")
                );
            }
        }

        const rootRelativeRedirectUrl = redirectUrl.slice(window.location.origin.length);

        log?.(`redirectUrl: ${rootRelativeRedirectUrl}`);

        const stateData: StateData = {
            context: "redirect",
            rootRelativeRedirectUrl,
            extraQueryParams: {},
            configId,
            action: "login",
            rootRelativeRedirectUrl_consentRequiredCase: (() => {
                switch (rest.action) {
                    case "login":
                        return (lastPublicUrl ?? homeUrl).slice(window.location.origin.length);
                    case "go to auth server":
                        return rootRelativeRedirectUrl;
                }
            })()
        };

        const isSilent = rest.action === "login" && rest.interaction === "ensure no interaction";

        const transformUrl_oidcClientTs = (url: string) => {
            (
                [
                    [
                        getExtraQueryParams,
                        transformUrlBeforeRedirect === undefined
                            ? undefined
                            : (url: string) =>
                                  transformUrlBeforeRedirect({
                                      isSilent,
                                      authorizationUrl: url
                                  })
                    ],
                    [extraQueryParams_local, transformUrlBeforeRedirect_local]
                ] as const
            ).forEach(([extraQueryParamsMaybeGetter, transformUrlBeforeRedirect], i, arr) => {
                const url_before = i !== arr.length - 1 ? undefined : url;

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

        if (rest.action === "login") {
            rest.preRedirectHook?.();
        }

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
                                    return "login";
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
            .then(
                () => new Promise<never>(() => {}),
                (error: Error) => {
                    if (error.message.includes("Crypto.subtle is available only in secure contexts")) {
                        throw new Error(
                            [
                                `oidc-spa: ${error.message}.`,
                                "To fix this error see:",
                                "https://docs.oidc-spa.dev/v/v8/resources/fixing-crypto.subtle-is-available-only-in-secure-contexts-https"
                            ].join(" ")
                        );
                    }

                    assert(false, "224238482");
                }
            );
    }

    const { unsubscribe } = evtInitializationOutcomeUserNotLoggedIn.subscribe(() => {
        unsubscribe();

        const realPushState = history.pushState.bind(history);
        history.pushState = function pushState(...args) {
            lastPublicUrl = window.location.href;
            return realPushState(...args);
        };
    });

    return {
        loginOrGoToAuthServer
    };
}
