import type { UserManager as OidcClientTsUserManager } from "../vendor/frontend/oidc-client-ts";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { assert, type Equals } from "../tools/tsafe/assert";
import { noUndefined } from "../tools/tsafe/noUndefined";
import { type StateData, generateStateUrlParamValue } from "./StateData";
import type { NonPostableEvt } from "../tools/Evt";
import { createStatefulEvt } from "../tools/StatefulEvt";
import { Deferred } from "../tools/Deferred";
import { addOrUpdateSearchParam, getAllSearchParams } from "../tools/urlSearchParams";
import { getIsOnline } from "../tools/getIsOnline";
import { isNetworkError } from "../tools/isNetworkError";
import { OidcInitializationError } from "./OidcInitializationError";
import { setStateDataCookieIfEnabled } from "./StateDataCookie";
import type { OidcProviderMetadata } from "./types";
import { getIsDeepLink } from "../tools/isDeepLink";
import { deepLinkToRootRelativeUrl } from "../tools/deepLinkToRootRelativeUrl";

const globalContext = {
    evtHasLoginBeenCalled: createStatefulEvt(() => false)
};

type Params = Params.Login | Params.GoToAuthServer;

namespace Params {
    type Common = {
        redirectUrl: string;
        authorizationParams_paramOfLoginOrGoToAuthServer:
            | Record<string, string | string[] | undefined>
            | undefined;
        transformAuthorizationUrl_paramOfLoginOrGoToAuthServer:
            | ((params: { authorizationUrl: string }) => string)
            | undefined;
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
    transformAuthorizationUrl_paramOfCreateOidc:
        | ((params: { authorizationUrl: string; isSilentRedirect: boolean }) => string)
        | undefined;

    getAuthorizationParams_paramsOfCreateOidc:
        | ((params: { isSilentRedirect: boolean }) => Record<string, string | string[] | undefined>)
        | undefined;

    tokenParams: Record<string, string | string[] | undefined> | undefined;

    homeUrl: string;
    stateUrlParamValue_instance: string;
    evtInitializationOutcomeUserNotLoggedIn: NonPostableEvt<void>;

    log: typeof console.log | undefined;
}) {
    const {
        configId,
        oidcClientTsUserManager,

        transformAuthorizationUrl_paramOfCreateOidc,
        getAuthorizationParams_paramsOfCreateOidc,
        tokenParams,

        homeUrl,
        stateUrlParamValue_instance,
        evtInitializationOutcomeUserNotLoggedIn,

        log
    } = params;

    let lastPublicUrl: string | undefined = undefined;

    async function loginOrGoToAuthServer(params: Params): Promise<never> {
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
            if (params.action !== "login") {
                break login_specific_handling;
            }

            if (globalContext.evtHasLoginBeenCalled.current) {
                log?.("login() has already been called, ignoring the call");
                return new Promise<never>(() => {});
            }

            globalContext.evtHasLoginBeenCalled.current = true;

            if (document.visibilityState !== "visible") {
                params.interaction === "ensure no interaction";

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
                if (params.doForceReloadOnBfCache) {
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

                    if (params.doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack) {
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

        const { rootRelativeRedirectUrl, redirectUrl_external } = (() => {
            const redirectUrl = toFullyQualifiedUrl({
                urlish: params.redirectUrl,
                doAssertNoQueryParams: false,
                rootUrl_fullyQualified: homeUrl
            });

            log?.(`post ${params.action} redirect url: ${redirectUrl}`);

            const isDeepLink = getIsDeepLink({
                fullyQualifiedUrl: redirectUrl,
                relativeTo_fullyQualified: homeUrl
            });

            if (isDeepLink) {
                return {
                    rootRelativeRedirectUrl: deepLinkToRootRelativeUrl({
                        fullyQualifiedDeepLinkUrl: redirectUrl
                    }),
                    redirectUrl_external: undefined
                };
            } else {
                return {
                    rootRelativeRedirectUrl: deepLinkToRootRelativeUrl({
                        fullyQualifiedDeepLinkUrl: homeUrl
                    }),
                    redirectUrl_external: redirectUrl
                };
            }
        })();

        const rootRelativeRedirectUrl_consentRequiredCase = (() => {
            switch (params.action) {
                case "login":
                    return deepLinkToRootRelativeUrl({
                        fullyQualifiedDeepLinkUrl: lastPublicUrl ?? homeUrl
                    });
                case "go to auth server":
                    return rootRelativeRedirectUrl;
            }
        })();

        setStateDataCookieIfEnabled({
            homeUrl,
            stateUrlParamValue_instance,
            stateDataCookie: {
                action: "login",
                rootRelativeRedirectUrl,
                rootRelativeRedirectUrl_consentRequiredCase
            }
        });

        const stateData: StateData.Redirect = {
            context: "redirect",
            rootRelativeRedirectUrl,
            authorizationParams: {},
            configId,
            action: "login",
            rootRelativeRedirectUrl_consentRequiredCase,
            redirectUrl_external
        };

        const redirectMethod = (() => {
            switch (params.action) {
                case "login":
                    return params.doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack
                        ? "replace"
                        : "assign";
                case "go to auth server":
                    return "assign";
            }
        })();

        log?.(`redirectMethod: ${redirectMethod}`);

        if (params.action === "login") {
            params.preRedirectHook?.();
        }

        return oidcClientTsUserManager
            .signinRedirect({
                state: stateData,
                redirectMethod,
                prompt: (() => {
                    switch (params.action) {
                        case "go to auth server":
                            return undefined;
                        case "login":
                            switch (params.interaction) {
                                case "ensure no interaction":
                                    return "none";
                                case "ensure interaction":
                                    return "login";
                                case "directly redirect if active session show login otherwise":
                                    return undefined;
                            }
                            assert<Equals<typeof params.interaction, never>>;
                    }
                    assert<Equals<typeof params, never>>;
                })(),
                transformUrl: (authorizationUrl: string): string =>
                    transformAuthorizationUrl_internal({
                        authorizationUrl,
                        authorizationParams_paramOfLoginOrGoToAuthServer:
                            params.authorizationParams_paramOfLoginOrGoToAuthServer,
                        transformAuthorizationUrl_paramOfLoginOrGoToAuthServer:
                            params.transformAuthorizationUrl_paramOfLoginOrGoToAuthServer,
                        transformAuthorizationUrl_paramOfCreateOidc,
                        getAuthorizationParams_paramsOfCreateOidc,
                        isSilentRedirect:
                            params.action === "login" && params.interaction === "ensure no interaction",
                        setStateDataAuthorizationParams: ({ authorizationParams }) => {
                            stateData.authorizationParams = authorizationParams;
                        }
                    }),
                extraTokenParams: tokenParams === undefined ? undefined : noUndefined(tokenParams)
            })
            .then(
                () => new Promise<never>(() => {}),
                error => {
                    assert(error instanceof Error, "393430");

                    // Reaching the auth server can fail for reasons that are not a defect of
                    // this library: the network dropped mid-redirect, or the browser refused
                    // the request outright. Firefox's Local Network Access, for one, blocks a
                    // public page from reaching an auth server that resolves to a private or
                    // CGNAT address, which is what a VPN split-DNS setup hands out. Reporting
                    // those as "please report a bug" sends users chasing the wrong thing.
                    if (isNetworkError(error)) {
                        throw new OidcInitializationError({
                            isAuthServerLikelyDown: getIsOnline().isOnline,
                            messageOrCause: [
                                `Could not reach the authorization server: ${error.message}.`,
                                "The server may be down, or the browser may have blocked the request",
                                "(check the console for a CSP, CORS or Local Network Access message)."
                            ].join(" ")
                        });
                    }

                    assert(
                        false,
                        `This is a bug in oidc-spa (loginOrGoToAuthServer), please report: ${error.message}`
                    );
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

const AUTHORIZATION_URL_BASE_QUERY_PARAMS_NAMES = [
    "client_id",
    "redirect_uri",
    "response_type",
    "scope",
    "state",
    "code_challenge",
    "response_mode"
] as const;

export function transformAuthorizationUrl_internal(params: {
    authorizationUrl: string;
    authorizationParams_paramOfLoginOrGoToAuthServer:
        | Record<string, string | string[] | undefined>
        | undefined;
    transformAuthorizationUrl_paramOfLoginOrGoToAuthServer:
        | ((params: { authorizationUrl: string }) => string)
        | undefined;
    transformAuthorizationUrl_paramOfCreateOidc:
        | ((params: { authorizationUrl: string; isSilentRedirect: boolean }) => string)
        | undefined;

    getAuthorizationParams_paramsOfCreateOidc:
        | ((params: { isSilentRedirect: boolean }) => Record<string, string | string[] | undefined>)
        | undefined;
    isSilentRedirect: boolean;
    setStateDataAuthorizationParams:
        | ((params: { authorizationParams: Record<string, string | string[]> }) => void)
        | undefined;
}): string {
    const {
        authorizationUrl,
        authorizationParams_paramOfLoginOrGoToAuthServer,
        transformAuthorizationUrl_paramOfLoginOrGoToAuthServer,
        transformAuthorizationUrl_paramOfCreateOidc,
        getAuthorizationParams_paramsOfCreateOidc,
        isSilentRedirect,
        setStateDataAuthorizationParams
    } = params;

    let authorizationUrl_transformed = authorizationUrl;

    (
        [
            [getAuthorizationParams_paramsOfCreateOidc, transformAuthorizationUrl_paramOfCreateOidc],
            [
                authorizationParams_paramOfLoginOrGoToAuthServer,
                transformAuthorizationUrl_paramOfLoginOrGoToAuthServer
            ]
        ] as const
    ).forEach(([authorizationParams_maybeGetter, transformAuthorizationUrl], i) => {
        const authorizationUrl_transformed_beforeCurrentPass = authorizationUrl_transformed;

        handle_getAuthorizationParams: {
            if (authorizationParams_maybeGetter === undefined) {
                break handle_getAuthorizationParams;
            }

            const authorizationParams =
                typeof authorizationParams_maybeGetter === "function"
                    ? authorizationParams_maybeGetter({ isSilentRedirect })
                    : authorizationParams_maybeGetter;

            for (const [name, valueOrValues] of Object.entries(authorizationParams)) {
                if (valueOrValues === undefined) {
                    continue;
                }
                authorizationUrl_transformed = addOrUpdateSearchParam({
                    url: authorizationUrl_transformed,
                    name,
                    values: valueOrValues instanceof Array ? valueOrValues : [valueOrValues],
                    encodeMethod: "www-form",
                    ifAlreadyPresent: "replace all by new values"
                });
            }
        }

        handle_transformAuthorizationUrl: {
            if (transformAuthorizationUrl === undefined) {
                break handle_transformAuthorizationUrl;
            }
            authorizationUrl_transformed = transformAuthorizationUrl({
                authorizationUrl: authorizationUrl_transformed,
                isSilentRedirect
            });
        }

        handle_setStateDataAuthorizationParams: {
            if (setStateDataAuthorizationParams === undefined) {
                break handle_setStateDataAuthorizationParams;
            }

            {
                const isGoToAuthServerPass = i === 1;

                if (!isGoToAuthServerPass) {
                    break handle_setStateDataAuthorizationParams;
                }
            }

            const paramValueByName_current = getAllSearchParams(authorizationUrl_transformed);
            const paramValueByName_before = getAllSearchParams(
                authorizationUrl_transformed_beforeCurrentPass
            );

            const stateData_authorizationParams: Record<string, string | string[]> = {};

            for (const [name, values_current] of Object.entries(paramValueByName_current)) {
                const values_before: string[] | undefined = paramValueByName_before[name];

                if (JSON.stringify(values_before) === JSON.stringify(values_current)) {
                    continue;
                }

                stateData_authorizationParams[name] =
                    values_current.length === 1 ? [values_current[0]] : values_current;
            }

            setStateDataAuthorizationParams({ authorizationParams: stateData_authorizationParams });
        }
    });

    check_no_illegal_alteration: {
        if (authorizationUrl === authorizationUrl_transformed) {
            break check_no_illegal_alteration;
        }

        const params_before = getAllSearchParams(authorizationUrl);
        const params_after = getAllSearchParams(authorizationUrl_transformed);

        for (const name of AUTHORIZATION_URL_BASE_QUERY_PARAMS_NAMES) {
            if (JSON.stringify(params_before[name]) !== JSON.stringify(params_after[name])) {
                throw new Error(
                    [
                        "oidc-spa: Illegal transformation of the authorizationUrl, can't alter the",
                        `${name} query parameter value.`
                    ].join(" ")
                );
            }
        }
    }

    return authorizationUrl_transformed;
}

export function getAuthorizationAudienceAndResourceParamsValues(params: {
    oidcProviderMetadata: Pick<OidcProviderMetadata, "authorization_endpoint">;
    clientId: string;
    homeUrlAndRedirectUri: string;
    scopes: string[];
    response_mode: "fragment" | "query";
    transformAuthorizationUrl_paramOfCreateOidc:
        | ((params: { authorizationUrl: string; isSilentRedirect: boolean }) => string)
        | undefined;

    getAuthorizationParams_paramsOfCreateOidc:
        | ((params: { isSilentRedirect: boolean }) => Record<string, string | string[] | undefined>)
        | undefined;
}): {
    audience: string[] | undefined;
    resource: string[] | undefined;
} {
    const {
        oidcProviderMetadata,
        clientId,
        homeUrlAndRedirectUri,
        scopes,
        response_mode,
        transformAuthorizationUrl_paramOfCreateOidc,
        getAuthorizationParams_paramsOfCreateOidc
    } = params;

    const authorizationUrl_probe = (() => {
        let url = oidcProviderMetadata.authorization_endpoint;

        for (const name of AUTHORIZATION_URL_BASE_QUERY_PARAMS_NAMES) {
            url = addOrUpdateSearchParam({
                url,
                encodeMethod: "www-form",
                ifAlreadyPresent: "throw",
                name,
                values: [
                    (() => {
                        switch (name) {
                            case "client_id":
                                return clientId;
                            case "redirect_uri":
                                return homeUrlAndRedirectUri;
                            case "response_type":
                                return "code";
                            case "scope":
                                return scopes.join(" ");
                            case "state":
                                return generateStateUrlParamValue();
                            case "code_challenge":
                                return "probe";
                            case "response_mode":
                                return response_mode;
                        }
                    })()
                ]
            });
        }

        return url;
    })();

    const authorizationUrl_probe_transformed = transformAuthorizationUrl_internal({
        authorizationUrl: authorizationUrl_probe,
        authorizationParams_paramOfLoginOrGoToAuthServer: undefined,
        transformAuthorizationUrl_paramOfLoginOrGoToAuthServer: undefined,
        transformAuthorizationUrl_paramOfCreateOidc,
        getAuthorizationParams_paramsOfCreateOidc,
        isSilentRedirect: true,
        setStateDataAuthorizationParams: undefined
    });

    const { audience, resource } = getAllSearchParams(authorizationUrl_probe_transformed);

    return {
        audience,
        resource
    };
}
