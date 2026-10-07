import {
    useState,
    useEffect,
    useReducer,
    createElement,
    useLayoutEffect,
    type ReactNode,
    type ComponentType
} from "react";
import type {
    OidcSpaUtils,
    RuntimeConfigs,
    CreateClientUser,
    Oidc_react,
    Oidc_client,
    LoaderContext
} from "./types";
import type { Oidc as Oidc_core } from "../core";
import { OidcInitializationError } from "../core/OidcInitializationError";
import { Deferred } from "../tools/Deferred";
import { isBrowser } from "../tools/isBrowser";
import { assert, type Equals } from "../tools/tsafe/assert";
import { createStatefulEvt, type StatefulReadonlyEvt, type StatefulEvt } from "../tools/StatefulEvt";
import { id } from "../tools/tsafe/id";
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";

export function createUtils<User, AutoLogin extends boolean>(params: {
    autoLogin: AutoLogin;
    createUser: CreateClientUser<User>;
    getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>;
}): OidcSpaUtils<User, AutoLogin> {
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

    const { autoLogin, createUser } = params;

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
              oidc: Oidc_core.LoggedIn<User>;
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
                        const { createMockOidc } = await import("../core/createMockOidc");

                        const oidc = await createMockOidc<User>({
                            createUser_mock: params =>
                                createUser({
                                    isMock: true,
                                    ...params
                                }),
                            // NOTE: The `as false` is lying here, it's just to preserve some level of type-safety.
                            autoLogin: autoLogin as false,
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
                        const { createOidc } = await import("../core");

                        let oidc: Oidc_core<User>;

                        try {
                            oidc = await createOidc<User, AutoLogin>({
                                autoLogin,
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
                                    createUser({
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

                let evtUser: StatefulEvt<User> | undefined = undefined;

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

    const suspencePr = (async () => {
        const ctx = await dClientCtx.pr;

        if (ctx.doWeHaveTheOidcObject && ctx.isUserLoggedIn) {
            await ctx.dUser.pr;
        }
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

                oidc.subscribeToAutoLogoutState(autoLogoutState => {
                    evtAutoLogoutState.current = autoLogoutState;
                });
            });

            return { evtAutoLogoutState };
        })();

        function useOidc(params?: {
            assert?: "user logged in" | "user not logged in";
        }): Oidc_react<User> {
            if (!isBrowser) {
                throw new Error(
                    [
                        "oidc-spa: useOidc() can't be used in SSR'd components.",
                        "You can prevent this component from rendering on the server",
                        "by wrapping it into <OidcInitializationGate />"
                    ].join(" ")
                );
            }

            useLayoutEffect(() => {
                triggerClientInitializationIfNotAlreadyDone();
            }, []);

            const { assert: assert_params } = params ?? {};

            type State =
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
                      oidc: Oidc_core.LoggedIn<User>;
                      evtUser: StatefulReadonlyEvt<User>;
                  };

            const state = ((): State => {
                const { hasResolved, value: ctx } = dClientCtx.getState();

                if (!hasResolved) {
                    throw suspencePr;
                }

                if (!ctx.doWeHaveTheOidcObject) {
                    if (autoLogin) {
                        return {
                            doWeHaveTheOidcObject: false as const,
                            initializationError: ctx.initializationError
                        };
                    } else {
                        const getAccessErrorMessage = (propertyName: string) =>
                            `oidc-spa: Cannot read oidc.${propertyName} because OIDC initialization failed before a client was available. Check oidc.initializationError before accessing provider configuration.`;

                        return {
                            doWeHaveTheOidcObject: true as const,
                            isUserLoggedIn: false,
                            oidc: id<Oidc_core.NotLoggedIn>({
                                isUserLoggedIn: false,
                                get clientId(): string {
                                    throw new Error(getAccessErrorMessage("clientId"));
                                },
                                get issuerUri(): string {
                                    throw new Error(getAccessErrorMessage("issuerUri"));
                                },
                                get validRedirectUri(): string {
                                    throw new Error(getAccessErrorMessage("validRedirectUri"));
                                },
                                login: async () => {
                                    alert(
                                        "Authentication is currently unavailable. Please try again later."
                                    );
                                    return new Promise<never>(() => {});
                                },
                                initializationError: ctx.initializationError
                            })
                        };
                    }
                }

                if (!ctx.isUserLoggedIn) {
                    return {
                        doWeHaveTheOidcObject: true as const,
                        isUserLoggedIn: false,
                        oidc: ctx.oidc
                    };
                }

                const { hasResolved: hasResolved_user, value: wrap_user } = ctx.dUser.getState();

                if (!hasResolved_user) {
                    throw suspencePr;
                }

                if (wrap_user.hasCreateUserThrown) {
                    if (autoLogin) {
                        return {
                            doWeHaveTheOidcObject: false as const,
                            initializationError: wrap_user.initializationError
                        };
                    } else {
                        return {
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
                    doWeHaveTheOidcObject: true as const,
                    isUserLoggedIn: true as const,
                    oidc: ctx.oidc,
                    evtUser: wrap_user.evtUser
                };
            })();

            if (!state.doWeHaveTheOidcObject) {
                assert(autoLogin, "32283339");
                throw new Error(
                    [
                        "oidc-spa: There was an oidc initialization error.",
                        "You should use <OidcInitializationErrorGate />",
                        "to catch thoses errors gracefully"
                    ].join(" ")
                );
            }

            check_assertion: {
                if (assert_params === undefined) {
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
                            throw new Error(getMessage("not to be logged in but currently they are"));
                        }
                        break;
                    default:
                        assert<Equals<typeof assert_params, never>>(false);
                }
            }

            const [evtIsUserUsed] = useState(() => createStatefulEvt<boolean>(() => false));
            {
                const evtUser = (() => {
                    if (!state.isUserLoggedIn) {
                        return undefined;
                    }
                    return state.evtUser;
                })();

                const [, reRender] = useReducer(n => n + 1, 0);

                const user_asReturned = evtUser?.current;

                useEffect(() => {
                    if (evtUser === undefined) {
                        return undefined;
                    }

                    let isActive = true;
                    let unsubscribe: (() => void) | undefined = undefined;

                    (async () => {
                        if (!evtIsUserUsed.current) {
                            const dUserUsed = new Deferred<void>();

                            const { unsubscribe: unsubscribe_scope } = evtIsUserUsed.subscribe(() => {
                                unsubscribe_scope();
                                dUserUsed.resolve();
                            });
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
                }, []);
            }

            const [evtIsAutoLogoutStateUsed] = useState(() => createStatefulEvt<boolean>(() => false));
            {
                const [, reRender] = useReducer(n => n + 1, 0);

                const autoLogountState_asReturned = evtAutoLogoutState.current;

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

                        if (evtAutoLogoutState.current !== autoLogountState_asReturned) {
                            reRender();
                        }
                    })();

                    return () => {
                        isActive = false;
                        unsubscribe?.();
                    };
                }, []);
            }

            if (!state.isUserLoggedIn) {
                return id<Oidc_react.NotLoggedIn>({
                    isUserLoggedIn: false,
                    initializationError: state.oidc.initializationError,
                    issuerUri: state.oidc.issuerUri,
                    clientId: state.oidc.clientId,
                    validRedirectUri: state.oidc.validRedirectUri,
                    autoLogoutState: { shouldDisplayWarning: false },
                    login: ({ doesCurrentHrefEnforceLogin = false, ...rest }) =>
                        state.oidc.login({
                            ...rest,
                            doesCurrentHrefEnforceLogin
                        })
                });
            }

            return id<Oidc_react.LoggedIn<User>>({
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
        let oidc_cached: Oidc_client<User> | undefined = undefined;

        async function getOidc(params?: {
            assert?: "user logged in" | "user not logged in" | "init completed";
        }): Promise<Oidc_client<User>> {
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
                    const oidc_proxy = id<Oidc_client.LoggedIn<User>>({
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
                } else {
                    return oidc;
                }
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

        const oidc = await getOidc();

        const returnToUrl = (() => {
            switch (loaderContext_discriminated.routingLibrary) {
                case "TanStack Router":
                    return toFullyQualifiedUrl({
                        urlish: loaderContext_discriminated.loaderContext.location.href,
                        doAssertNoQueryParams: false,
                        rootUrl_fullyQualified: oidc.validRedirectUri
                    });
                case "React Router":
                    return loaderContext_discriminated.loaderContext.request.href;
                default:
                    assert<Equals<typeof loaderContext_discriminated, never>>(false, "3393220");
            }
        })();

        const isUrlAlreadyReplaced =
            window.location.href.replace(/\/$/, "") === returnToUrl.replace(/\/$/, "");

        if (!oidc.isUserLoggedIn) {
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

            await oidc.login({
                returnToUrl,
                doesCurrentHrefEnforceLogin: isUrlAlreadyReplaced
            });
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
    }

    function withLoginEnforced<Props extends Record<string, unknown>>(
        component: ComponentType<Props>
    ): (props: Props) => ReactNode {
        const Component = component;

        function ComponentWithLoginEnforced(props: Props) {
            const { isUserLoggedIn, login } = useOidc();

            if (!isUserLoggedIn) {
                throw login({ doesCurrentHrefEnforceLogin: true });
            }

            return createElement(Component, props);
        }

        ComponentWithLoginEnforced.displayName = `${
            Component.displayName ?? Component.name ?? "Component"
        }WithLoginEnforced`;

        return ComponentWithLoginEnforced;
    }

    function OidcInitializationGate(props: { fallback?: ReactNode; children: ReactNode }) {
        const { fallback, children } = props;

        const [isReadyToRender, readyToRender] = useReducer(() => true, false);

        useEffect(() => {
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

                readyToRender();
            })();

            return () => {
                isActive = false;
            };
        }, []);

        if (!isReadyToRender) {
            return fallback !== undefined ? fallback : null;
        }

        return children;
    }

    function OidcInitializationErrorGate(props: {
        errorComponent: ComponentType<{
            initializationError: OidcInitializationError;
        }>;
        children: ReactNode;
    }): ReactNode {
        const { errorComponent: ErrorComponent, children } = props;

        if (!isBrowser) {
            throw new Error(
                [
                    "oidc-spa: <OidcInitializationErrorGate /> can't be SSR'd.",
                    "You can prevent this component from rendering on the server",
                    "by wrapping it into <OidcInitializationGate />"
                ].join(" ")
            );
        }

        const initializationError = (() => {
            const { hasResolved, value: ctx } = dClientCtx.getState();

            if (!hasResolved) {
                throw suspencePr;
            }

            if (!ctx.doWeHaveTheOidcObject) {
                return ctx.initializationError;
            }

            // NOTE: OidcInitializationErrorGate is only exposed when autoLogin
            // is enabled
            assert(ctx.isUserLoggedIn, "293392");

            const { hasResolved: hasResolved_user, value: ctx_user } = ctx.dUser.getState();

            if (!hasResolved_user) {
                throw suspencePr;
            }

            if (ctx_user.hasCreateUserThrown) {
                return ctx_user.initializationError;
            }

            return undefined;
        })();

        if (initializationError !== undefined) {
            return createElement(ErrorComponent, { initializationError });
        }

        return children;
    }

    // @ts-expect-error
    return {
        useOidc,
        getOidc,
        enforceLogin,
        withLoginEnforced,
        OidcInitializationGate,
        OidcInitializationErrorGate
    };
}
