import { useState, useEffect, useLayoutEffect, useReducer } from "react";
import type {
    OidcSpaUtils,
    RuntimeConfigs,
    Oidc_server,
    CreateClientUser,
    CreateServerUser,
    AccessTokenClaims,
    Oidc_react,
    Oidc_client
} from "./types";
import type { Oidc as Oidc_core } from "../../core";
import { OidcInitializationError } from "../../core/OidcInitializationError";
import { Deferred } from "../../tools/Deferred";
import { isBrowser } from "../../tools/isBrowser";
import { assert, type Equals, is } from "../../tools/tsafe/assert";
import { createStatefulEvt, type StatefulReadonlyEvt, type StatefulEvt } from "../../tools/StatefulEvt";
import { id } from "../../tools/tsafe/id";
import type { OptionallyAsyncGetterOrDirectValue } from "../../tools/GetterOrDirectValue";
import { createServerFn, createMiddleware } from "@tanstack/react-start";
// @ts-expect-error: Since our module is not labeled as ESM we don't have the types here.
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
//import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start-server";
import { toFullyQualifiedUrl } from "../../tools/toFullyQualifiedUrl";
import { BEFORE_LOAD_FN_BRAND_PROPERTY_NAME } from "./disableSsrIfLoginEnforced";
import type { MaybeAsync } from "../../tools/MaybeAsync";
import { enableStateDataCookie } from "../../core/StateDataCookie";
import { createObjectThatThrowsIfAccessed } from "../../tools/createObjectThatThrowsIfAccessed";
import { publicEnvNames, toRedactEnvNames } from "virtual:oidc-spa/tanstack-start-public-env";
import { ValidateAndGetAccessTokenClaims } from "../../server";
import * as runExclusive from "../../tools/run-exclusive";

export function createUtils<User_client, User_server, AutoLogin extends boolean>(params: {
    autoLogin: AutoLogin;
    createClientUser: CreateClientUser<User_client>;
    createServerUser: CreateServerUser<User_server> | undefined;
    getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<
        { process: { env: Record<string, string> } },
        RuntimeConfigs<User_client, User_server, AutoLogin>
    >;
}): OidcSpaUtils<User_client, User_server, AutoLogin> {
    const getRuntimeConfigs = (() => {
        const { getRuntimeConfigsOrRuntimeConfigs } = params;

        if (typeof getRuntimeConfigsOrRuntimeConfigs === "function") {
            const getRuntimeConfigs = getRuntimeConfigsOrRuntimeConfigs;

            return getRuntimeConfigs;
        } else {
            const runtimeConfigs = getRuntimeConfigsOrRuntimeConfigs;

            return () => runtimeConfigs;
        }
    })();

    const { useOidc, getOidc, enforceLogin } = (() => {
        const { autoLogin, createClientUser } = params;

        const dClientCtx = new Deferred<
            | {
                  doWeHaveTheOidcObject: false;
                  initializationError: OidcInitializationError;
              }
            | {
                  doWeHaveTheOidcObject: true;
                  isUserLoggedIn: false;
                  oidc: Oidc_core.NotLoggedIn;
              }
            | {
                  doWeHaveTheOidcObject: true;
                  isUserLoggedIn: true;
                  oidc: Oidc_core.LoggedIn<User_client>;
                  dUser: Deferred<
                      | {
                            hasCreateUserThrown: true;
                            initializationError: OidcInitializationError;
                        }
                      | {
                            hasCreateUserThrown: false;
                            evtUser: StatefulReadonlyEvt<User_client>;
                        }
                  >;
              }
        >();

        const { triggerClientInitializationIfNotAlreadyDone } = (() => {
            const d = new Deferred<void>();

            d.pr.then(async () => {
                const runtimeConfigs = await (async () => {
                    class OidcSpaServerEnvRetrievalError extends Error {
                        constructor(params: { envName: string }) {
                            super(
                                `oidc-spa: Env value ${params.envName} couldn't be pulled from server`
                            );
                            Object.setPrototypeOf(this, new.target.prototype);
                        }
                    }

                    const env_server_proxy = new Proxy(
                        publicEnvNames.size === 0 && toRedactEnvNames.size === 0
                            ? {}
                            : await fetchServerEnvVariableValues(),
                        {
                            get: (target, envName) => {
                                assert(typeof envName === "string");

                                if (!(envName in target)) {
                                    throw new OidcSpaServerEnvRetrievalError({ envName });
                                }

                                return target[envName] ?? undefined;
                            },
                            has: (target, envName) => {
                                assert(typeof envName === "string");

                                if (!(envName in target)) {
                                    throw new OidcSpaServerEnvRetrievalError({ envName });
                                }

                                return target[envName] !== null;
                            }
                        }
                    ) as Record<string, string>;

                    let runtimeConfigs: RuntimeConfigs<User_client, User_server, AutoLogin>;

                    try {
                        runtimeConfigs = await getRuntimeConfigs({ process: { env: env_server_proxy } });
                    } catch (error) {
                        dClientCtx.resolve({
                            doWeHaveTheOidcObject: false,
                            initializationError: new OidcInitializationError({
                                isAuthServerLikelyDown: false,
                                messageOrCause: new Error(
                                    "Error thrown while evaluating the runtime configs getter on the client",
                                    // @ts-expect-error
                                    { cause: error }
                                )
                            })
                        });

                        await new Promise<never>(() => {});

                        assert(false);
                    }

                    return runtimeConfigs;
                })();

                switch (runtimeConfigs.mode) {
                    case "mock":
                        {
                            const { createMockOidc } = await import("../../core/createMockOidc");

                            const oidc = await createMockOidc<User_client>({
                                createUser_mock: params =>
                                    createClientUser({
                                        isMock: true,
                                        ...params
                                    }),
                                // NOTE: The `as false` is lying here, it's just to preserve some level of type-safety.
                                autoLogin: autoLogin as false,
                                isUserInitiallyLoggedIn:
                                    runtimeConfigs.client?.isUserInitiallyLoggedIn ?? true,

                                issuerUri_mock: runtimeConfigs.issuerUri_mock,
                                clientId_mock: runtimeConfigs.client?.clientId_mock,
                                idTokenClaims_mock: runtimeConfigs.client?.idTokenClaims_mock,
                                idToken_mock: runtimeConfigs.client?.idToken_mock,
                                accessToken_mock: runtimeConfigs.accessToken_mock,
                                refreshToken_mock: runtimeConfigs.client?.refreshToken_mock
                            });

                            if (!oidc.isUserLoggedIn) {
                                dClientCtx.resolve({
                                    doWeHaveTheOidcObject: true,
                                    isUserLoggedIn: false,
                                    oidc
                                });
                                break;
                            }

                            dClientCtx.resolve({
                                doWeHaveTheOidcObject: true,
                                isUserLoggedIn: true,
                                oidc,
                                dUser: new Deferred()
                            });
                        }
                        break;
                    case "real":
                        {
                            enableStateDataCookie();

                            const { createOidc } = await import("../../core");

                            let oidc: Oidc_core<User_client>;

                            try {
                                oidc = await createOidc<User_client, AutoLogin>({
                                    autoLogin,
                                    issuerUri: runtimeConfigs.issuerUri,
                                    clientId: runtimeConfigs.client.clientId,
                                    idleSessionLifetimeInSeconds:
                                        runtimeConfigs.client.idleSessionLifetimeInSeconds,
                                    scopes: runtimeConfigs.client.scopes,
                                    transformAuthorizationUrl:
                                        runtimeConfigs.client.transformAuthorizationUrl,
                                    authorizationParams: runtimeConfigs.client.authorizationParams,
                                    tokenParams: runtimeConfigs.client.tokenParams,
                                    sessionRestorationMethod:
                                        runtimeConfigs.client.sessionRestorationMethod,
                                    debugLogs: runtimeConfigs.debugLogs,
                                    __oidcProviderMetadata: runtimeConfigs.client.__oidcProviderMetadata,
                                    autoLogout_redirectionTarget:
                                        runtimeConfigs.client.autoLogout_redirectionTarget,
                                    disableDPoP: runtimeConfigs.client.disableDPoP,
                                    warnUserSecondsBeforeAutoLogout:
                                        runtimeConfigs.client.warnUserSecondsBeforeAutoLogout,
                                    createUser: params =>
                                        createClientUser({
                                            isMock: false,
                                            ...params
                                        })
                                });
                            } catch (error) {
                                if (!(error instanceof OidcInitializationError)) {
                                    throw error;
                                }

                                dClientCtx.resolve({
                                    doWeHaveTheOidcObject: false,
                                    initializationError: error
                                });

                                break;
                            }

                            if (!oidc.isUserLoggedIn) {
                                dClientCtx.resolve({
                                    isUserLoggedIn: false,
                                    doWeHaveTheOidcObject: true,
                                    oidc
                                });
                                break;
                            }

                            dClientCtx.resolve({
                                doWeHaveTheOidcObject: true,
                                isUserLoggedIn: true,
                                oidc,
                                dUser: new Deferred()
                            });
                        }
                        break;
                }

                resolve_dUser: {
                    const { hasResolved, value: ctx } = dClientCtx.getState();

                    assert(hasResolved, "49332832");

                    if (!ctx.doWeHaveTheOidcObject) {
                        break resolve_dUser;
                    }

                    if (!ctx.isUserLoggedIn) {
                        break resolve_dUser;
                    }

                    const { oidc, dUser } = ctx;

                    let evtUser: StatefulEvt<User_client> | undefined = undefined;

                    const { unsubscribeFromUserChange } = oidc.subscribeToUserChange(
                        ({ user, user_previous }) => {
                            if (user_previous === undefined) {
                                return;
                            }
                            if (evtUser === undefined) {
                                evtUser = createStatefulEvt(() => user);
                            } else {
                                evtUser.current = user;
                            }
                        }
                    );

                    try {
                        await oidc.refreshUser();
                    } catch (error) {
                        unsubscribeFromUserChange();
                        assert(error instanceof OidcInitializationError, "3440334");
                        dUser.resolve({
                            hasCreateUserThrown: true,
                            initializationError: error
                        });
                        break resolve_dUser;
                    }

                    assert(evtUser !== undefined, "293302");

                    dUser.resolve({
                        hasCreateUserThrown: false,
                        evtUser
                    });
                }
            });

            function triggerClientInitializationIfNotAlreadyDone(): void {
                d.resolve();
            }

            return { triggerClientInitializationIfNotAlreadyDone };
        })();

        const { useOidc } = (() => {
            const { evtAutoLogoutState } = (() => {
                const evtAutoLogoutState = createStatefulEvt<
                    Oidc_react.LoggedIn<unknown>["autoLogoutState"]
                >(() => ({
                    shouldDisplayWarning: false
                }));

                dClientCtx.pr.then(wrap => {
                    if (!wrap.doWeHaveTheOidcObject) {
                        return;
                    }

                    const { oidc } = wrap;

                    if (!oidc.isUserLoggedIn) {
                        return;
                    }

                    oidc.subscribeToAutoLogoutState(autoLogountState => {
                        evtAutoLogoutState.current = autoLogountState;
                    });
                });

                return { evtAutoLogoutState };
            })();

            const useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : useEffect;

            function useOidc(params?: {
                assert?: "user logged in" | "user not logged in" | "ready";
            }): Oidc_react<User_client> {
                useIsomorphicLayoutEffect(() => {
                    triggerClientInitializationIfNotAlreadyDone();
                }, []);

                const { assert: assert_params } = params ?? {};

                type State =
                    | { isPending: true }
                    | {
                          isPending: false;
                          doWeHaveTheOidcObject: false;
                          initializationError: OidcInitializationError;
                      }
                    | {
                          isPending: false;
                          doWeHaveTheOidcObject: true;
                          isUserLoggedIn: false;
                          oidc: Oidc_core.NotLoggedIn;
                      }
                    | {
                          isPending: false;
                          doWeHaveTheOidcObject: true;
                          isUserLoggedIn: true;
                          oidc: Oidc_core.LoggedIn<User_client>;
                          evtUser: StatefulReadonlyEvt<User_client>;
                      };

                const state = ((): State => {
                    const { hasResolved, value: ctx } = dClientCtx.getState();

                    if (!hasResolved) {
                        return {
                            isPending: true
                        };
                    }

                    if (!ctx.doWeHaveTheOidcObject) {
                        return {
                            isPending: false as const,
                            doWeHaveTheOidcObject: false as const,
                            initializationError: ctx.initializationError
                        };
                    }

                    if (!ctx.isUserLoggedIn) {
                        return {
                            isPending: false as const,
                            doWeHaveTheOidcObject: true as const,
                            isUserLoggedIn: false,
                            oidc: ctx.oidc
                        };
                    }

                    const { hasResolved: hasResolved_user, value: wrap_user } = ctx.dUser.getState();

                    if (!hasResolved_user) {
                        return {
                            isPending: true as const
                        };
                    }

                    if (wrap_user.hasCreateUserThrown) {
                        if (autoLogin) {
                            return {
                                isPending: false as const,
                                doWeHaveTheOidcObject: false as const,
                                initializationError: wrap_user.initializationError
                            };
                        } else {
                            return {
                                isPending: false as const,
                                doWeHaveTheOidcObject: true as const,
                                isUserLoggedIn: false as const,
                                oidc: id<Oidc_core.NotLoggedIn>({
                                    isUserLoggedIn: false,
                                    issuerUri: ctx.oidc.issuerUri,
                                    clientId: ctx.oidc.clientId,
                                    validRedirectUri: ctx.oidc.validRedirectUri,
                                    login: () => {
                                        console.warn(
                                            [
                                                "oidc-spa: Calling login while user already logged in but the user",
                                                "object couldn't be constructed, reloading the page"
                                            ].join(" ")
                                        );
                                        window.location.reload();
                                        return new Promise<never>(() => {});
                                    },
                                    initializationError: wrap_user.initializationError
                                })
                            };
                        }
                    }

                    return {
                        isPending: false as const,
                        doWeHaveTheOidcObject: true as const,
                        isUserLoggedIn: true as const,
                        oidc: ctx.oidc,
                        evtUser: wrap_user.evtUser
                    };
                })();

                check_assertion: {
                    if (assert_params === undefined) {
                        break check_assertion;
                    }

                    if (state.isPending || !state.doWeHaveTheOidcObject) {
                        throw new Error(
                            [
                                "oidc-spa: There is a logic error in the application.",
                                `you called useOidc({ assert: "${assert_params}" }) but`,
                                ...(isBrowser
                                    ? [
                                          "the component making this call was rendered before",
                                          "the auth state of the user was established."
                                      ]
                                    : ["we are on the server, this assertion will always be wrong."]),
                                "\nTo avoid this error make sure to check isOidcReady higher in the tree."
                            ].join(" ")
                        );
                    }

                    if (assert_params === "ready") {
                        break check_assertion;
                    }

                    const getMessage = (v: string) =>
                        [
                            "oidc-spa: There is a logic error in the application.",
                            `If this component is mounted the user is supposed ${v}.`,
                            "An explicit assertion was made in this sense."
                        ].join(" ");

                    switch (assert_params) {
                        case "user logged in":
                            if (!state.isUserLoggedIn) {
                                throw new Error(getMessage("to be logged in but currently they arn't"));
                            }
                            break;
                        case "user not logged in":
                            if (state.isUserLoggedIn) {
                                throw new Error(
                                    getMessage("not to be logged in but currently they are")
                                );
                            }
                            break;
                        default:
                            assert<Equals<typeof assert_params, never>>(false);
                    }
                }

                {
                    const [, reRender] = useReducer(n => n + 1, 0);

                    useEffect(() => {
                        if (!state.isPending) {
                            return;
                        }

                        let isActive = true;

                        (async () => {
                            const ctx = await dClientCtx.pr;

                            if (!isActive) {
                                return;
                            }

                            if (ctx.doWeHaveTheOidcObject && ctx.isUserLoggedIn) {
                                await ctx.dUser.pr;
                                if (!isActive) {
                                    return;
                                }
                            }

                            reRender();
                        })();

                        return () => {
                            isActive = false;
                        };
                    }, []);
                }

                const [evtIsUserUsed] = useState(() => createStatefulEvt<boolean>(() => false));
                {
                    const evtUser = (() => {
                        if (state.isPending) {
                            return undefined;
                        }

                        if (!state.doWeHaveTheOidcObject) {
                            return undefined;
                        }

                        if (!state.isUserLoggedIn) {
                            return undefined;
                        }

                        return state.evtUser;
                    })();

                    const [, reRenderIfUserChanged] = useState<User_client | undefined>(() => {
                        if (evtUser === undefined) {
                            return undefined;
                        }
                        return evtUser.current;
                    });

                    useEffect(() => {
                        if (evtUser === undefined) {
                            return undefined;
                        }

                        let isActive = true;
                        let unsubscribe: (() => void) | undefined = undefined;

                        (async () => {
                            if (!evtIsUserUsed.current) {
                                const dUserUsed = new Deferred<void>();

                                const { unsubscribe: unsubscribe_scope } = evtIsUserUsed.subscribe(
                                    () => {
                                        unsubscribe_scope();
                                        dUserUsed.resolve();
                                    }
                                );
                                unsubscribe = unsubscribe_scope;

                                await dUserUsed.pr;

                                if (!isActive) {
                                    return;
                                }
                            }

                            reRenderIfUserChanged(evtUser.current);

                            unsubscribe = evtUser.subscribe(user => {
                                reRenderIfUserChanged(user);
                            }).unsubscribe;
                        })();

                        return () => {
                            isActive = false;
                            unsubscribe?.();
                        };
                    }, [evtUser]);
                }

                const [evtIsAutoLogoutStateUsed] = useState(() =>
                    createStatefulEvt<boolean>(() => false)
                );

                const [, reRenderIfAutoLogoutStateChanged] = useState(() => evtAutoLogoutState.current);

                useEffect(() => {
                    let isActive = true;
                    let unsubscribe: (() => void) | undefined = undefined;

                    (async () => {
                        if (!evtIsAutoLogoutStateUsed.current) {
                            const dAutoLogoutStateUsed = new Deferred<void>();

                            const { unsubscribe: unsubscribe_scope } =
                                evtIsAutoLogoutStateUsed.subscribe(() => {
                                    unsubscribe_scope();
                                    dAutoLogoutStateUsed.resolve();
                                });
                            unsubscribe = unsubscribe_scope;

                            await dAutoLogoutStateUsed.pr;

                            if (!isActive) {
                                return;
                            }
                        }

                        reRenderIfAutoLogoutStateChanged(evtAutoLogoutState.current);

                        unsubscribe = evtAutoLogoutState.subscribe(
                            reRenderIfAutoLogoutStateChanged
                        ).unsubscribe;
                    })();

                    return () => {
                        isActive = false;
                        unsubscribe?.();
                    };
                }, []);

                const [hasHydrated, setHasHydratedToTrue] = useReducer(
                    () => true,
                    assert_params !== undefined ? undefined : false
                );

                useEffect(() => {
                    if (hasHydrated === undefined) {
                        return;
                    }
                    setHasHydratedToTrue();
                }, []);

                if (state.isPending || !state.doWeHaveTheOidcObject || hasHydrated === false) {
                    return id<Oidc_react.NotReady>({
                        isOidcReady: false,
                        autoLogoutState: {
                            shouldDisplayWarning: false
                        },
                        oidcInitializationError: (() => {
                            if (!hasHydrated) {
                                return undefined;
                            }
                            if (state.isPending) {
                                return undefined;
                            }

                            assert(!state.doWeHaveTheOidcObject, "339433");

                            return state.initializationError;
                        })()
                    });
                }

                if (!state.isUserLoggedIn) {
                    return id<Oidc_react.NotLoggedIn>({
                        isOidcReady: true,
                        isUserLoggedIn: false,
                        oidcInitializationError: state.oidc.initializationError,
                        issuerUri: state.oidc.issuerUri,
                        clientId: state.oidc.clientId,
                        validRedirectUri: state.oidc.validRedirectUri,
                        autoLogoutState: { shouldDisplayWarning: false },
                        login: params =>
                            state.oidc.login({
                                doesCurrentHrefRequiresAuth: false,
                                ...params
                            })
                    });
                }

                return id<Oidc_react.LoggedIn<User_client>>({
                    isOidcReady: true,
                    isUserLoggedIn: true,
                    issuerUri: state.oidc.issuerUri,
                    clientId: state.oidc.clientId,
                    validRedirectUri: state.oidc.validRedirectUri,
                    logout: state.oidc.logout,
                    renewTokens: state.oidc.renewTokens,
                    goToAuthServer: state.oidc.goToAuthServer,
                    backFromAuthServer: state.oidc.backFromAuthServer,
                    isNewBrowserSession: state.oidc.isNewBrowserSession,
                    get autoLogoutState() {
                        evtIsAutoLogoutStateUsed.current = true;
                        return evtAutoLogoutState.current;
                    },
                    get user() {
                        evtIsUserUsed.current = true;
                        return state.evtUser.current;
                    },
                    refreshUser: state.oidc.refreshUser
                });
            }

            return { useOidc };
        })();

        let redirectUrl_temporaryOverride: string | undefined = undefined;

        const { getOidc } = (() => {
            let oidc_cached: Oidc_client<User_client> | undefined = undefined;

            async function getOidc(params?: {
                assert?: "user logged in" | "user not logged in" | "init completed";
            }): Promise<Oidc_client<User_client>> {
                if (!isBrowser) {
                    throw new Error(
                        [
                            "oidc-spa: getOidc() can't be used on the server",
                            "if you use it in a loader, make sure to mark the route",
                            "as `ssr: false`."
                        ].join(" ")
                    );
                }

                triggerClientInitializationIfNotAlreadyDone();

                const wrap = await dClientCtx.pr;

                if (!wrap.doWeHaveTheOidcObject) {
                    return new Promise<never>(() => {});
                }

                const { oidc } = wrap;

                if (params?.assert === "user logged in" && !oidc.isUserLoggedIn) {
                    throw new Error(
                        [
                            "oidc-spa: Called getOidc({ assert: 'user logged in' })",
                            "but the user is not currently logged in."
                        ].join(" ")
                    );
                }
                if (params?.assert === "user not logged in" && oidc.isUserLoggedIn) {
                    throw new Error(
                        [
                            "oidc-spa: Called getOidc({ assert: 'user not logged in' })",
                            "but the user is currently logged in."
                        ].join(" ")
                    );
                }

                if (oidc_cached !== undefined) {
                    return oidc_cached;
                }

                oidc_cached = (() => {
                    if (oidc.isUserLoggedIn) {
                        const oidc_proxy = id<Oidc_client.LoggedIn<User_client>>({
                            ...oidc,
                            getTokens: params => {
                                if (params === undefined) {
                                    return oidc.getTokens();
                                }
                                return oidc.getTokens({
                                    ...params,
                                    redirectUrl: params.redirectUrl ?? redirectUrl_temporaryOverride
                                });
                            },
                            getAccessToken: async (params): Promise<string> => {
                                const { accessToken } = await oidc_proxy.getTokens(params);
                                return accessToken;
                            }
                        });
                        return oidc_proxy;
                    } else {
                        return oidc;
                    }
                })();

                return oidc_cached;
            }

            return { getOidc };
        })();

        async function enforceLogin(loaderContext: {
            cause: "preload" | string;
            location: {
                publicHref: string;
            };
        }): Promise<void | never> {
            if (!isBrowser) {
                throw new Error(
                    [
                        "oidc-spa: enforceLogin cannot be used on the server",
                        "make sure to mark any route that uses it as ssr: false"
                    ].join(" ")
                );
            }

            const { cause } = loaderContext;

            const redirectUrl = (() => {
                if (loaderContext.location?.publicHref !== undefined) {
                    return toFullyQualifiedUrl({
                        urlish: loaderContext.location.publicHref,
                        doAssertNoQueryParams: false,
                        rootUrl_fullyQualified: window.location.origin
                    });
                }

                return window.location.href;
            })();

            const oidc = await getOidc();

            const isUrlAlreadyReplaced =
                window.location.href.replace(/\/$/, "") === redirectUrl.replace(/\/$/, "");

            if (!oidc.isUserLoggedIn) {
                if (cause === "preload") {
                    throw new Error(
                        [
                            "oidc-spa: User is not yet logged in.",
                            "This is not an error, this is an expected case.",
                            "It's only TanStack Router using exception as control flow."
                        ].join(" ")
                    );
                }

                await oidc.login({
                    redirectUrl,
                    doesCurrentHrefRequiresAuth: isUrlAlreadyReplaced
                });
            }

            set_redirectUrl_getTokens: {
                if (isUrlAlreadyReplaced) {
                    break set_redirectUrl_getTokens;
                }

                redirectUrl_temporaryOverride = redirectUrl;

                const history_pushState = history.pushState;
                const history_replaceState = history.replaceState;

                const onNavigated = () => {
                    history.pushState = history_pushState;
                    history.replaceState = history_replaceState;
                    redirectUrl_temporaryOverride = undefined;
                };

                history.pushState = function pushState(...args) {
                    onNavigated();
                    return history_pushState.call(history, ...args);
                };

                history.replaceState = function replaceState(...args) {
                    onNavigated();
                    return history_replaceState.call(history, ...args);
                };
            }
        }

        enforceLogin[BEFORE_LOAD_FN_BRAND_PROPERTY_NAME] = true;

        return { useOidc, getOidc, enforceLogin };
    })();

    const { oidcFnMiddleware, oidcRequestMiddleware } = (() => {
        if (params.createServerUser === undefined) {
            return {
                oidcFnMiddleware: undefined,
                oidcRequestMiddleware: undefined
            };
        }

        const { createServerUser } = params;

        const { getLazyServerMaterial } = (() => {
            type R = R_Success | R_Error;

            type R_Success = { isSuccess: true } & (
                | {
                      isMock: true;
                      runtimeConfigs_mock: RuntimeConfigs.Mock<true>;
                  }
                | {
                      isMock: false;
                      enableDebugLogs: boolean;
                      validateAndGetAccessTokenClaims: ValidateAndGetAccessTokenClaims<AccessTokenClaims>;
                  }
            );

            type R_Error = {
                isSuccess: false;
            };

            let cachedReturn: R_Success | undefined = undefined;

            const getLazyServerMaterial = runExclusive.build(async (): Promise<R> => {
                if (cachedReturn !== undefined) {
                    return cachedReturn;
                }

                const missingEnvNames = new Set<string>();

                const env_proxy = new Proxy<Record<string, string>>(
                    {},
                    {
                        get: (...[, envName]) => {
                            assert(typeof envName === "string");

                            const value = process.env[envName];

                            if (!value) {
                                missingEnvNames.add(envName);
                            }

                            return value;
                        },
                        has: (...[, envName]) => {
                            assert(typeof envName === "string");
                            return envName in process.env;
                        }
                    }
                );

                let runtimeConfigs: RuntimeConfigs<User_client, User_server, AutoLogin>;

                try {
                    runtimeConfigs = await getRuntimeConfigs({ process: { env: env_proxy } });
                } catch (error) {
                    console.error(`oidc-spa: Error thrown by the getter of runtime configs`, error);
                    return { isSuccess: false };
                }

                assert("server" in runtimeConfigs);

                if (
                    runtimeConfigs.mode === "real" &&
                    (!runtimeConfigs.issuerUri ||
                        (() => {
                            switch (runtimeConfigs.server.accessTokenValidationMethod) {
                                case "introspection endpoint":
                                    return (
                                        !runtimeConfigs.server.clientId ||
                                        !runtimeConfigs.server.clientSecret
                                    );
                                case "offline JWT validation":
                                    return !runtimeConfigs.server.expectedAccessTokenAudience;
                                default:
                                    assert<Equals<typeof runtimeConfigs.server, never>>;
                            }
                        })())
                ) {
                    throw new Error(
                        [
                            "oidc-spa: Incorrect configuration provided:\n",
                            JSON.stringify(runtimeConfigs, null, 2),
                            ...(missingEnvNames.size === 0
                                ? []
                                : [
                                      "\nYou probably forgot to define the environnement variables:",
                                      Array.from(missingEnvNames).join(", ")
                                  ])
                        ].join(" ")
                    );
                }

                switch (runtimeConfigs.mode) {
                    case "mock": {
                        assert(is<RuntimeConfigs.Mock<true>>(runtimeConfigs));
                        return {
                            isSuccess: true,
                            isMock: true as const,
                            runtimeConfigs_mock: runtimeConfigs
                        };
                    }
                    case "real": {
                        assert("server" in runtimeConfigs);

                        const { oidcSpa: oidcSpa_server } = await import("../../server");

                        const { bootstrapAuth, validateAndGetAccessTokenClaims } =
                            oidcSpa_server.createUtils();

                        bootstrapAuth({
                            mode: "real",
                            issuerUri: runtimeConfigs.issuerUri,
                            accessTokenValidation: (() => {
                                switch (runtimeConfigs.server.accessTokenValidationMethod) {
                                    case "introspection endpoint":
                                        return {
                                            method: "introspection endpoint",
                                            clientId: runtimeConfigs.server.clientId,
                                            clientSecret: runtimeConfigs.server.clientSecret
                                        };
                                    case "offline JWT validation":
                                        return {
                                            method: "offline JWT validation",
                                            expectedAudience:
                                                runtimeConfigs.server.expectedAccessTokenAudience
                                        };
                                    default:
                                        assert<Equals<typeof runtimeConfigs.server, never>>(false);
                                }
                            })()
                        });

                        return {
                            isSuccess: true,
                            isMock: false as const,
                            validateAndGetAccessTokenClaims,
                            enableDebugLogs: runtimeConfigs.debugLogs ?? false
                        };
                    }
                    default:
                        assert<Equals<typeof runtimeConfigs, never>>(false);
                }
            });

            return { getLazyServerMaterial };
        })();

        function createFunctionMiddlewareServerFn(params?: {
            require?: "authed request";
            hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
        }) {
            return async (options: {
                next: (options: { context: { oidc: Oidc_server<User_server> } }) => any;
            }): Promise<any> => {
                const { next } = options;

                const serverMaterial = await getLazyServerMaterial();

                if (!serverMaterial.isSuccess) {
                    setResponseStatus(500);
                    throw new Error("Internal Server Error");
                }

                if (serverMaterial.isMock) {
                    const { runtimeConfigs_mock } = serverMaterial;

                    const accessToken_mock =
                        runtimeConfigs_mock.accessToken_mock ??
                        id<typeof import("../../core/createMockOidc").ACCESS_TOKEN_MOCK_DEFAULT>(
                            "mocked-access-token"
                        );

                    let user_mock: User_server;

                    try {
                        user_mock = await createServerUser({
                            isMock: true,
                            accessToken: accessToken_mock,
                            accessTokenClaims:
                                runtimeConfigs_mock.server?.accessTokenClaims_mock ??
                                createObjectThatThrowsIfAccessed<AccessTokenClaims>({
                                    debugMessage: "No accessTokenClaims_mock provided"
                                })
                        });
                    } catch (error) {
                        console.error(
                            `oidc-spa: Error thrown while calling createServerUser with mock identity`,
                            error
                        );
                        setResponseStatus(500);
                        throw new Error("Internal Server Error");
                    }

                    return next({
                        context: {
                            oidc: id<Oidc_server<User_server>>(
                                id<Oidc_server.LoggedIn<User_server>>({
                                    isAuthedRequest: true,
                                    accessToken: accessToken_mock,
                                    user: user_mock
                                })
                            )
                        }
                    });
                }

                const { validateAndGetAccessTokenClaims, enableDebugLogs } = serverMaterial;

                const log = (() => {
                    if (!enableDebugLogs) {
                        return undefined;
                    }

                    return id<typeof console.log>((...[first, ...rest]) => {
                        const label = "oidc-spa";

                        if (typeof first === "string") {
                            console.log(...[`${label}: ${first}`, ...rest]);
                        } else {
                            console.log(...[`${label}:`, first, ...rest]);
                        }
                    });
                })();

                const { extractRequestAuthContext } = await import(
                    "../../server/extractRequestAuthContext"
                );

                const requestAuthContext = extractRequestAuthContext({
                    request: getRequest() as Request,
                    trustProxy: true
                });

                if (requestAuthContext === undefined) {
                    if (params?.require === "authed request") {
                        const wwwAuthenticateResponseHeaderValue =
                            'Bearer error="invalid_request", error_description="Missing access token"';
                        setResponseHeader("WWW-Authenticate", wwwAuthenticateResponseHeaderValue);
                        setResponseStatus(401, "Unauthorized");
                        throw new Error(wwwAuthenticateResponseHeaderValue);
                    }
                    return next({
                        context: {
                            oidc: id<Oidc_server<User_server>>(
                                id<Oidc_server.NotLoggedIn>({
                                    isAuthedRequest: false
                                })
                            )
                        }
                    });
                }

                if (!requestAuthContext.isWellFormed) {
                    const wwwAuthenticateResponseHeaderValue =
                        'Bearer error="invalid_request", error_description="Malformed or unsupported request"';
                    setResponseHeader("WWW-Authenticate", wwwAuthenticateResponseHeaderValue);
                    setResponseStatus(400, "Bad Request");
                    throw new Error(wwwAuthenticateResponseHeaderValue);
                }

                const {
                    isSuccess,
                    debugErrorMessage,
                    accessToken,
                    accessTokenClaims,
                    recommendedHttpErrorStatusCode
                } = await validateAndGetAccessTokenClaims(requestAuthContext.accessTokenAndMetadata);

                if (!isSuccess) {
                    log?.(debugErrorMessage);
                    setResponseStatus(recommendedHttpErrorStatusCode);
                    const wwwAuthenticateResponseHeaderValue = `Bearer error="invalid_request", error_description="${(() => {
                        switch (recommendedHttpErrorStatusCode) {
                            case 401:
                                return "Invalid token";
                            case 500:
                                return "Internal server error";
                            case 503:
                                return "Retry later";
                        }
                    })()}"`;
                    setResponseHeader("WWW-Authenticate", wwwAuthenticateResponseHeaderValue);
                    throw new Error(wwwAuthenticateResponseHeaderValue);
                }

                let user: User_server;

                try {
                    user = await createServerUser({
                        isMock: false,
                        accessToken,
                        accessTokenClaims
                    });
                } catch (error) {
                    log?.(`oidc-spa: Error thrown while calling createServerUser`, error);
                    setResponseStatus(500);
                    throw new Error("Internal Server Error");
                }

                check_authorization: {
                    const getHasAuthorization = params?.hasAuthorization;

                    if (getHasAuthorization === undefined) {
                        break check_authorization;
                    }

                    let hasAuthorization: boolean;

                    try {
                        hasAuthorization = await getHasAuthorization({ user });
                    } catch (error) {
                        log?.(`oidc-spa: Error thrown while calling hasAuthorization`, error);
                        setResponseStatus(500);
                        throw new Error("Internal Server Error");
                    }

                    if (hasAuthorization) {
                        break check_authorization;
                    }

                    log?.("Unauthorized request rejected");

                    setResponseStatus(403);

                    const wwwAuthenticateResponseHeaderValue =
                        'Bearer error="insufficient_scope", error_description="Insufficient privileges"';

                    setResponseHeader("WWW-Authenticate", wwwAuthenticateResponseHeaderValue);

                    throw new Error(wwwAuthenticateResponseHeaderValue);
                }

                return next({
                    context: {
                        oidc: id<Oidc_server<User_server>>(
                            id<Oidc_server.LoggedIn<User_server>>({
                                isAuthedRequest: true,
                                accessToken,
                                user
                            })
                        )
                    }
                });
            };
        }

        function oidcRequestMiddleware(params?: {
            require?: "authed request";
            hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
        }) {
            return createMiddleware({ type: "request" }).server<{
                oidc: Oidc_server<User_server>;
            }>(createFunctionMiddlewareServerFn(params));
        }

        function oidcFnMiddleware(params?: {
            require?: "authed request";
            hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
        }) {
            return createMiddleware({ type: "function" })
                .client(async ({ next }) => {
                    const oidc = await getOidc();

                    if (params?.require === "authed request" && !oidc.isUserLoggedIn) {
                        throw new Error(
                            [
                                "oidc-spa: You used oidcFnMiddleware({ require: 'authed request' })",
                                "but the server function the middleware was attached to was called",
                                "while the user is not logged in."
                            ].join(" ")
                        );
                    }

                    if (!oidc.isUserLoggedIn) {
                        return next();
                    }

                    return next({
                        headers: {
                            Authorization: `Bearer ${await oidc.getAccessToken()}`
                        }
                    });
                })
                .server<{
                    oidc: Oidc_server<AccessTokenClaims>;
                }>(createFunctionMiddlewareServerFn(params));
        }

        return { oidcRequestMiddleware, oidcFnMiddleware };
    })();

    // @ts-expect-error
    return {
        useOidc,
        getOidc,
        enforceLogin,
        oidcFnMiddleware,
        oidcRequestMiddleware
    };
}

const fetchServerEnvVariableValues = createServerFn({ method: "GET" }).handler(async () => ({
    ...Object.fromEntries(
        Array.from(publicEnvNames).map(envVarName => [envVarName, process.env[envVarName] ?? null])
    ),
    ...Object.fromEntries(
        Array.from(toRedactEnvNames).map(envVarName => [envVarName, "redacted on client"])
    )
}));
