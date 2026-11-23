import {
    useState,
    useEffect,
    useLayoutEffect,
    useReducer,
    createElement,
    type ReactNode,
    type ComponentType
} from "react";
import type {
    OidcSpaUtils,
    RuntimeConfigs,
    CreateClientUser,
    Oidc_react,
    Oidc,
    LoaderContext
} from "./types";
import { OidcInitializationError } from "../core/OidcInitializationError";
import { Deferred } from "../tools/Deferred";
import { isBrowser } from "../tools/isBrowser";
import { assert, type Equals } from "../tools/tsafe/assert";
import { createStatefulEvt, type StatefulReadonlyEvt, type StatefulEvt } from "../tools/StatefulEvt";
import { id } from "../tools/tsafe/id";
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { getHomeUrl_earlyInit } from "../core/earlyInit_homeUrl";
import { getValidRedirectUri } from "../core/validRedirectUri";
import { getSsr_earlyInit } from "../core/earlyInit_ssr";

export function createUtils<User>(params: {
    createClientUser: CreateClientUser<User>;
    getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>;
}): OidcSpaUtils<User> {
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

    const { useOidc, getOidc, enforceLogin, withLoginEnforced } = (() => {
        const { createClientUser } = params;

        const dClientCtx = new Deferred<
            | {
                  doWeHaveOidcInstance: false;
                  runtimeConfigs:
                      | {
                            issuerUri: string;
                            clientId: string;
                        }
                      | undefined;
                  oidcInitializationError: OidcInitializationError;
              }
            | {
                  doWeHaveOidcInstance: true;
                  isUserLoggedIn: false;
                  oidc: Oidc.NotLoggedIn;
              }
            | {
                  doWeHaveOidcInstance: true;
                  isUserLoggedIn: true;
                  oidc: Oidc.LoggedIn<User>;
                  dUser: Deferred<
                      | {
                            hasCreateUserThrown: true;
                            initializationError: OidcInitializationError;
                        }
                      | {
                            hasCreateUserThrown: false;
                            evtUser: StatefulReadonlyEvt<User>;
                        }
                  >;
              }
        >();

        const { triggerClientInitializationIfNotAlreadyDone } = (() => {
            const d = new Deferred<void>();

            d.pr.then(async () => {
                const runtimeConfigs = await (async () => {
                    let runtimeConfigs: RuntimeConfigs;

                    try {
                        runtimeConfigs = await getRuntimeConfigs();
                    } catch (error) {
                        dClientCtx.resolve({
                            doWeHaveOidcInstance: false,
                            runtimeConfigs: undefined,
                            oidcInitializationError: new OidcInitializationError({
                                isAuthServerLikelyDown: false,
                                messageOrCause: new Error(
                                    "Error while loading runtime configs on the client",
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
                            const { createMockOidc } = await import("../core/createMockOidc");

                            const oidc = await createMockOidc<User>({
                                createUser_mock: params =>
                                    createClientUser({
                                        isMock: true,
                                        ...params
                                    }),
                                isUserInitiallyLoggedIn: runtimeConfigs.isUserInitiallyLoggedIn ?? true,

                                issuerUri_mock: runtimeConfigs.issuerUri_mock,
                                clientId_mock: runtimeConfigs.clientId_mock,
                                idTokenClaims_mock: runtimeConfigs.idTokenClaims_mock,
                                idToken_mock: runtimeConfigs.idToken_mock,
                                accessToken_mock: runtimeConfigs.accessToken_mock,
                                refreshToken_mock: runtimeConfigs.refreshToken_mock
                            });

                            if (!oidc.isUserLoggedIn) {
                                dClientCtx.resolve({
                                    doWeHaveOidcInstance: true,
                                    isUserLoggedIn: false,
                                    oidc
                                });
                                break;
                            }

                            dClientCtx.resolve({
                                doWeHaveOidcInstance: true,
                                isUserLoggedIn: true,
                                oidc,
                                dUser: new Deferred()
                            });
                        }
                        break;
                    case "real":
                        {
                            const { createOidc } = await import("../core");

                            let oidc: Oidc<User>;

                            try {
                                oidc = await createOidc<User>({
                                    issuerUri: runtimeConfigs.issuerUri,
                                    clientId: runtimeConfigs.clientId,
                                    idleSessionLifetimeInSeconds:
                                        runtimeConfigs.idleSessionLifetimeInSeconds,
                                    scopes: runtimeConfigs.scopes,
                                    transformAuthorizationUrl: runtimeConfigs.transformAuthorizationUrl,
                                    authorizationParams: runtimeConfigs.authorizationParams,
                                    tokenParams: runtimeConfigs.tokenParams,
                                    sessionRestorationMethod: runtimeConfigs.sessionRestorationMethod,
                                    debugLogs: runtimeConfigs.debugLogs,
                                    __oidcProviderMetadata: runtimeConfigs.__oidcProviderMetadata,
                                    autoLogout_returnToUrl: runtimeConfigs.autoLogout_returnToUrl,
                                    disableDPoP: runtimeConfigs.disableDPoP,
                                    warnUserSecondsBeforeAutoLogout:
                                        runtimeConfigs.warnUserSecondsBeforeAutoLogout,
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
                                    doWeHaveOidcInstance: false,
                                    runtimeConfigs: {
                                        issuerUri: runtimeConfigs.issuerUri,
                                        clientId: runtimeConfigs.clientId
                                    },
                                    oidcInitializationError: error
                                });

                                break;
                            }

                            if (!oidc.isUserLoggedIn) {
                                dClientCtx.resolve({
                                    doWeHaveOidcInstance: true,
                                    isUserLoggedIn: false,
                                    oidc
                                });
                                break;
                            }

                            dClientCtx.resolve({
                                doWeHaveOidcInstance: true,
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

                    if (!ctx.doWeHaveOidcInstance) {
                        break resolve_dUser;
                    }

                    if (!ctx.isUserLoggedIn) {
                        break resolve_dUser;
                    }

                    const { oidc, dUser } = ctx;

                    let evtUser: StatefulEvt<User> | undefined = undefined;

                    const { unsubscribeFromUserChange } = oidc.subscribeToUserChange(({ user }) => {
                        if (evtUser === undefined) {
                            evtUser = createStatefulEvt(() => user);
                        } else {
                            evtUser.current = user;
                        }
                    });

                    try {
                        // Initialize from the current tokens; refreshUser() explicitly renews them.
                        await oidc.getUser();
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

                dClientCtx.pr.then(ctx => {
                    if (!ctx.doWeHaveOidcInstance) {
                        return;
                    }

                    if (!ctx.isUserLoggedIn) {
                        return;
                    }

                    ctx.oidc.subscribeToAutoLogoutState(autoLogoutState => {
                        evtAutoLogoutState.current = autoLogoutState;
                    });
                });

                return { evtAutoLogoutState };
            })();

            const useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : () => {};

            const prNoLongerPending = (async () => {
                if (!isBrowser) {
                    return;
                }

                const ctx = await dClientCtx.pr;

                if (ctx.doWeHaveOidcInstance && ctx.isUserLoggedIn) {
                    await ctx.dUser.pr;
                }
            })();

            const prNever = new Promise<never>(() => {});

            const getIsSsrEnabled = () => {
                try {
                    return getSsr_earlyInit();
                } catch {
                    return false;
                }
            };

            function useOidc(params?: {
                assert?: "user logged in" | "user not logged in";
            }): Oidc_react<User> {
                useIsomorphicLayoutEffect(() => {
                    triggerClientInitializationIfNotAlreadyDone();
                }, []);

                const { assert: assert_params } = params ?? {};

                type State =
                    | {
                          isReady: false;
                          oidcInitializationError: OidcInitializationError | undefined;
                      }
                    | {
                          isReady: true;
                          isUserLoggedIn: false;
                          oidc: Oidc.NotLoggedIn;
                      }
                    | {
                          isReady: true;
                          isUserLoggedIn: true;
                          oidc: Oidc.LoggedIn<User>;
                          evtUser: StatefulReadonlyEvt<User>;
                      };

                const state = ((): State => {
                    const { hasResolved, value: ctx } = dClientCtx.getState();

                    if (!hasResolved) {
                        return {
                            isReady: false,
                            oidcInitializationError: undefined
                        };
                    }

                    if (!ctx.doWeHaveOidcInstance) {
                        return {
                            isReady: false,
                            oidcInitializationError: ctx.oidcInitializationError
                        };
                    }

                    if (!ctx.isUserLoggedIn) {
                        return {
                            isReady: true,
                            isUserLoggedIn: false,
                            oidc: ctx.oidc
                        };
                    }

                    const { hasResolved: hasResolved_user, value: ctx_user } = ctx.dUser.getState();

                    if (!hasResolved_user) {
                        return {
                            isReady: false,
                            oidcInitializationError: undefined
                        };
                    }

                    if (ctx_user.hasCreateUserThrown) {
                        return {
                            isReady: false,
                            oidcInitializationError: ctx_user.initializationError
                        };
                    }

                    return {
                        isReady: true,
                        isUserLoggedIn: true,
                        oidc: ctx.oidc,
                        evtUser: ctx_user.evtUser
                    };
                })();

                check_assertion: {
                    if (assert_params === undefined) {
                        break check_assertion;
                    }

                    if (!state.isReady) {
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
                        if (state.isReady) {
                            return;
                        }

                        let isActive = true;

                        (async () => {
                            const ctx = await dClientCtx.pr;

                            if (!isActive) {
                                return;
                            }

                            if (ctx.doWeHaveOidcInstance && ctx.isUserLoggedIn) {
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
                        if (!state.isReady) {
                            return undefined;
                        }

                        if (!state.isUserLoggedIn) {
                            return undefined;
                        }

                        return state.evtUser;
                    })();

                    const [, reRender] = useReducer(n => n + 1, 0);

                    const user_asReturned = evtUser?.current;

                    useEffect(() => {
                        if (evtUser === undefined) {
                            return;
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

                            unsubscribe = evtUser.subscribe(() => {
                                reRender();
                            }).unsubscribe;

                            if (evtUser.current !== user_asReturned) {
                                reRender();
                            }
                        })();

                        return () => {
                            isActive = false;
                            unsubscribe?.();
                        };
                    }, [state.isReady]);
                }

                const [evtIsAutoLogoutStateUsed] = useState(() =>
                    createStatefulEvt<boolean>(() => false)
                );
                {
                    const [, reRender] = useReducer(n => n + 1, 0);

                    const autoLogoutState_asReturned = evtAutoLogoutState.current;

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

                            unsubscribe = evtAutoLogoutState.subscribe(() => {
                                reRender();
                            }).unsubscribe;

                            if (evtAutoLogoutState.current !== autoLogoutState_asReturned) {
                                reRender();
                            }
                        })();

                        return () => {
                            isActive = false;
                            unsubscribe?.();
                        };
                    }, []);
                }

                const [hasHydrated, setHasHydratedToTrue] = useReducer(
                    () => true,
                    assert_params !== undefined || !getIsSsrEnabled() ? undefined : false
                );

                useEffect(() => {
                    if (hasHydrated === undefined) {
                        return;
                    }
                    setHasHydratedToTrue();
                }, []);

                // Cache login once authentication is ready; initial renders can be pending.
                const [getLogin] = useState(() => {
                    let login: Oidc_react.NotLoggedIn["login"] | undefined;

                    return (oidc: Oidc.NotLoggedIn) =>
                        (login ??= params =>
                            oidc.login({ doesCurrentHrefEnforceLogin: false, ...params }));
                });

                if (!state.isReady || hasHydrated === false) {
                    const oidc_react = id<Oidc_react.NotReady>({
                        isOidcReady: false,
                        autoLogoutState: {
                            shouldDisplayWarning: false
                        },
                        initializationError:
                            !state.isReady && hasHydrated !== false
                                ? state.oidcInitializationError
                                : undefined,
                        get suspensePromise() {
                            if (getIsSsrEnabled() || !isBrowser) {
                                throw new Error(
                                    [
                                        "oidc-spa: Usage error, oidc.suspensePromise cannot be used,",
                                        "in apps where SSR or SSG is involved. Throwing a promise on",
                                        "the server means streaming HTML, not delegate to the client."
                                    ].join(" ")
                                );
                            }

                            if (!state.isReady && state.oidcInitializationError !== undefined) {
                                return prNever;
                            }

                            if (!hasHydrated) {
                                Promise.resolve().then(() => {
                                    triggerClientInitializationIfNotAlreadyDone();
                                });
                            }

                            return prNoLongerPending;
                        }
                    });

                    {
                        const pd = Object.getOwnPropertyDescriptor(oidc_react, "suspensePromise");
                        assert(pd !== undefined, "393382");
                        Object.defineProperty(oidc_react, "suspensePromise", {
                            ...pd,
                            enumerable: false
                        });
                    }

                    return oidc_react;
                }

                if (!state.isUserLoggedIn) {
                    return id<Oidc_react.NotLoggedIn>({
                        isOidcReady: true,
                        isUserLoggedIn: false,
                        initializationError: state.oidc.initializationError,
                        issuerUri: state.oidc.issuerUri,
                        clientId: state.oidc.clientId,
                        validRedirectUri: state.oidc.validRedirectUri,
                        autoLogoutState: { shouldDisplayWarning: false },
                        login: getLogin(state.oidc)
                    });
                }

                return id<Oidc_react.LoggedIn<User>>({
                    isOidcReady: true,
                    isUserLoggedIn: true,
                    issuerUri: state.oidc.issuerUri,
                    clientId: state.oidc.clientId,
                    validRedirectUri: state.oidc.validRedirectUri,
                    logout: state.oidc.logout,
                    renewTokens: state.oidc.renewTokens,
                    startAuthorization: state.oidc.startAuthorization,
                    authorizationResult: state.oidc.authorizationResult,
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

        let returnToUrl_temporaryOverride: string | undefined = undefined;

        const { getOidc } = (() => {
            let oidc_cached: Oidc<User> | undefined = undefined;

            async function getOidc(params?: {
                assert?: "user logged in" | "user not logged in";
            }): Promise<Oidc<User>> {
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

                const ctx = await dClientCtx.pr;

                if (params?.assert === "user logged in") {
                    if (!ctx.doWeHaveOidcInstance || !ctx.isUserLoggedIn) {
                        throw new Error(
                            [
                                "oidc-spa: Called getOidc({ assert: 'user logged in' })",
                                "but the user is not currently logged in."
                            ].join(" ")
                        );
                    }
                }

                if (params?.assert === "user not logged in") {
                    if (ctx.doWeHaveOidcInstance && ctx.isUserLoggedIn) {
                        throw new Error(
                            [
                                "oidc-spa: Called getOidc({ assert: 'user not logged in' })",
                                "but the user is currently logged in."
                            ].join(" ")
                        );
                    }
                }

                if (oidc_cached !== undefined) {
                    return oidc_cached;
                }

                oidc_cached = await (async () => {
                    if (!ctx.doWeHaveOidcInstance) {
                        return id<Oidc.NotLoggedIn>({
                            isUserLoggedIn: false,
                            issuerUri:
                                ctx.runtimeConfigs === undefined
                                    ? "https://not-resolved-yet"
                                    : toFullyQualifiedUrl({
                                          urlish: ctx.runtimeConfigs.issuerUri,
                                          doAssertNoQueryParams: true,
                                          doOutputWithTrailingSlash: false,
                                          rootUrl_fullyQualified: window.location.origin
                                      }),
                            clientId:
                                ctx.runtimeConfigs === undefined
                                    ? "not-resolved-yet"
                                    : ctx.runtimeConfigs.clientId,
                            get validRedirectUri() {
                                let homeUrl: string;
                                try {
                                    homeUrl = getHomeUrl_earlyInit();
                                } catch {
                                    return "redirect-uri-is-unknown";
                                }
                                return getValidRedirectUri({ homeUrl });
                            },
                            login: async () => {
                                throw ctx.oidcInitializationError;
                            },
                            initializationError: ctx.oidcInitializationError
                        });
                    }

                    if (!ctx.isUserLoggedIn) {
                        return ctx.oidc;
                    }

                    const { oidc } = ctx;

                    const oidc_proxy = id<Oidc.LoggedIn<User>>({
                        ...oidc,
                        getTokens: params => {
                            if (params === undefined) {
                                return oidc.getTokens();
                            }
                            return oidc.getTokens({
                                ...params,
                                returnToUrl: params.returnToUrl ?? returnToUrl_temporaryOverride
                            });
                        },
                        getAccessToken: async (params): Promise<string> => {
                            const { accessToken } = await oidc_proxy.getTokens(params);
                            return accessToken;
                        }
                    });

                    return oidc_proxy;
                })();

                return oidc_cached;
            }

            return { getOidc };
        })();

        async function enforceLogin(loaderContext: LoaderContext): Promise<void | never> {
            if (!isBrowser) {
                throw new Error(
                    [
                        "oidc-spa: enforceLogin cannot be used on the server",
                        "make sure to mark any route that uses it as ssr: false"
                    ].join(" ")
                );
            }

            const loaderContext_discriminated:
                | { routingLibrary: "TanStack Router"; loaderContext: LoaderContext.TanStackRouterLike }
                | { routingLibrary: "React Router"; loaderContext: LoaderContext.ReactRouterLike } =
                "location" in loaderContext
                    ? {
                          routingLibrary: "TanStack Router",
                          loaderContext
                      }
                    : {
                          routingLibrary: "React Router",
                          loaderContext
                      };

            triggerClientInitializationIfNotAlreadyDone();

            const ctx = await dClientCtx.pr;

            if (!ctx.doWeHaveOidcInstance || !ctx.isUserLoggedIn) {
                if (
                    loaderContext_discriminated.routingLibrary === "TanStack Router" &&
                    loaderContext_discriminated.loaderContext.cause === "preload"
                ) {
                    throw new Error(
                        [
                            "oidc-spa: User is not yet logged in.",
                            "This is not an error, this is an expected case.",
                            "It's only TanStack Router using exception as control flow."
                        ].join(" ")
                    );
                }

                if (!ctx.doWeHaveOidcInstance) {
                    throw ctx.oidcInitializationError;
                }

                if (ctx.oidc.initializationError !== undefined) {
                    throw ctx.oidc.initializationError;
                }
            }

            const returnToUrl = (() => {
                switch (loaderContext_discriminated.routingLibrary) {
                    case "TanStack Router":
                        return toFullyQualifiedUrl({
                            urlish: loaderContext_discriminated.loaderContext.location.href,
                            doAssertNoQueryParams: false,
                            rootUrl_fullyQualified: getHomeUrl_earlyInit()
                        });
                    case "React Router":
                        return loaderContext_discriminated.loaderContext.request.url;
                    default:
                        assert<Equals<typeof loaderContext_discriminated, never>>(false, "3393220");
                }
            })();

            const isUrlAlreadyReplaced =
                window.location.href.replace(/\/$/, "") === returnToUrl.replace(/\/$/, "");

            if (!ctx.isUserLoggedIn) {
                await ctx.oidc.login({
                    returnToUrl,
                    doesCurrentHrefEnforceLogin: isUrlAlreadyReplaced
                });
                assert(false, "333203");
            }

            set_returnToUrl_getTokens: {
                if (isUrlAlreadyReplaced) {
                    break set_returnToUrl_getTokens;
                }

                returnToUrl_temporaryOverride = returnToUrl;

                const history_pushState = history.pushState;
                const history_replaceState = history.replaceState;

                const onNavigated = () => {
                    history.pushState = history_pushState;
                    history.replaceState = history_replaceState;
                    returnToUrl_temporaryOverride = undefined;
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

            {
                const ctx_user = await ctx.dUser.pr;

                if (ctx_user.hasCreateUserThrown) {
                    throw ctx_user.initializationError;
                }
            }
        }

        function withLoginEnforced<Props extends Record<string, unknown>>(params: {
            component: ComponentType<Props>;
            errorComponent?: ComponentType<{ oidcInitializationError: OidcInitializationError }>;
            pendingComponent?: ComponentType;
        }): (props: Props) => ReactNode {
            const {
                component: Component,
                errorComponent: ErrorComponent,
                pendingComponent: PendingComponent
            } = params;

            const useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : () => {};

            function ComponentWithLoginEnforced(props: Props) {
                const [initializationError_login, setInitializationError_login] = useReducer<
                    OidcInitializationError | undefined,
                    [OidcInitializationError]
                >((...[, error]) => error, undefined);

                useIsomorphicLayoutEffect(() => {
                    let isActive = true;

                    const returnToUrl = location.href;

                    (async () => {
                        const ctx = await dClientCtx.pr;

                        if (!isActive) {
                            return;
                        }

                        if (!ctx.doWeHaveOidcInstance) {
                            return;
                        }

                        if (ctx.isUserLoggedIn) {
                            return;
                        }

                        if (ctx.oidc.initializationError) {
                            return;
                        }

                        try {
                            await ctx.oidc.login({
                                doesCurrentHrefEnforceLogin: true,
                                returnToUrl
                            });
                        } catch (error) {
                            if (!isActive) {
                                return;
                            }

                            if (!(error instanceof OidcInitializationError)) {
                                throw error;
                            }

                            setInitializationError_login(error);
                        }
                    })();

                    return () => {
                        isActive = false;
                    };
                }, []);

                const {
                    isOidcReady,
                    isUserLoggedIn,
                    initializationError = initializationError_login
                } = useOidc();

                if (initializationError !== undefined) {
                    if (ErrorComponent === undefined) {
                        return createElement(
                            "div",
                            { role: "alert" },
                            createElement("p", null, "Authentication initialization failed."),
                            createElement(
                                "pre",
                                { style: { whiteSpace: "pre-wrap" } },
                                initializationError.message
                            ),
                            createElement(
                                "button",
                                { type: "button", onClick: () => window.location.reload() },
                                "Reload page"
                            )
                        );
                    }

                    return createElement(ErrorComponent, {
                        oidcInitializationError: initializationError
                    });
                }

                if (!isOidcReady || !isUserLoggedIn) {
                    return PendingComponent === undefined ? null : createElement(PendingComponent, {});
                }

                return createElement(Component, props);
            }

            ComponentWithLoginEnforced.displayName = `${
                Component.displayName ?? Component.name ?? "Component"
            }WithLoginEnforced`;

            return ComponentWithLoginEnforced;
        }

        return { useOidc, getOidc, enforceLogin, withLoginEnforced };
    })();

    return {
        // @ts-expect-error: We know what we are doing
        useOidc,
        // @ts-expect-error: We know what we are doing
        getOidc,
        enforceLogin,
        withLoginEnforced
    };
}
