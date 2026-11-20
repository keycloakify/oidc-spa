import {
    computed,
    getCurrentInstance,
    onMounted,
    shallowReadonly,
    shallowRef,
    triggerRef,
    type ShallowRef
} from "vue";
import type {
    AutoLogoutState,
    OidcSpaUtils,
    RuntimeConfigs,
    CreateClientUser,
    Oidc_vue,
    Oidc,
    RouteLocationNormalizedGenericLike
} from "./types";
import { OidcInitializationError } from "../core/OidcInitializationError";
import { Deferred } from "../tools/Deferred";
import { isBrowser } from "../tools/isBrowser";
import { assert, type Equals } from "../tools/tsafe/assert";
import { id } from "../tools/tsafe/id";
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { getBASE_URL_earlyInit } from "../core/earlyInit_BASE_URL";
import { getIsStateDataCookieEnabled } from "../core/StateDataCookie.toggle";

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
                        user: Readonly<ShallowRef<User>>;
                    }
              >;
          }
    >();

    const { triggerClientInitializationIfNotAlreadyDone } = (() => {
        const d = new Deferred<void>();

        const prInitialization = d.pr.then(async () => {
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

                if (!ctx.doWeHaveOidcInstance || !ctx.isUserLoggedIn) {
                    break resolve_dUser;
                }

                const { oidc, dUser } = ctx;

                // getOidc() can be used without a component observing user readiness.
                void dUser.pr.catch(() => {});

                let user: ShallowRef<User> | undefined = undefined;

                const { unsubscribeFromUserChange } = oidc.subscribeToUserChange(
                    ({ user: user_next }) => {
                        if (user === undefined) {
                            user = shallowRef(user_next);
                        } else if (Object.is(user.value, user_next)) {
                            triggerRef(user);
                        } else {
                            user.value = user_next;
                        }
                    }
                );

                try {
                    // Initialize from the current tokens; refreshUser() explicitly renews them.
                    const user_initial = await oidc.getUser();
                    // A cached user may be returned without a new notification.
                    user ??= shallowRef(user_initial);
                } catch (error) {
                    unsubscribeFromUserChange();
                    if (!(error instanceof OidcInitializationError)) {
                        throw error;
                    }
                    dUser.resolve({
                        hasCreateUserThrown: true,
                        initializationError: error
                    });
                    break resolve_dUser;
                }

                assert(user !== undefined, "293302");

                dUser.resolve({
                    hasCreateUserThrown: false,
                    user: shallowReadonly(user)
                });
            }
        });

        prInitialization.catch(error => {
            const { hasResolved, value: ctx } = dClientCtx.getState();

            if (!hasResolved) {
                console.error(error);
                dClientCtx.reject(error);
            } else if (ctx.doWeHaveOidcInstance && ctx.isUserLoggedIn) {
                ctx.dUser.reject(error);
            }
        });

        function triggerClientInitializationIfNotAlreadyDone(): void {
            d.resolve();
        }

        return { triggerClientInitializationIfNotAlreadyDone };
    })();

    const { useOidc } = (() => {
        type State =
            | { isReady: false; oidcInitializationError: OidcInitializationError | undefined }
            | { isReady: true; isUserLoggedIn: false; oidc: Oidc.NotLoggedIn }
            | {
                  isReady: true;
                  isUserLoggedIn: true;
                  oidc: Oidc.LoggedIn<User>;
                  user: Readonly<ShallowRef<User>>;
              };

        const state = shallowRef<State>({ isReady: false, oidcInitializationError: undefined });
        const unexpectedError = shallowRef<{ error: unknown }>();
        const evtAutoLogoutState = shallowRef<AutoLogoutState>({ shouldDisplayWarning: false });
        const autoLogoutState = shallowReadonly(evtAutoLogoutState);
        const autoLogoutState_notLoggedIn = shallowReadonly(
            shallowRef({ shouldDisplayWarning: false as const })
        );

        dClientCtx.pr
            .then(async ctx => {
                if (!ctx.doWeHaveOidcInstance) {
                    state.value = {
                        isReady: false,
                        oidcInitializationError: ctx.oidcInitializationError
                    };
                    return;
                }

                if (!ctx.isUserLoggedIn) {
                    state.value = { isReady: true, isUserLoggedIn: false, oidc: ctx.oidc };
                    return;
                }

                ctx.oidc.subscribeToAutoLogoutState(autoLogoutState_next => {
                    evtAutoLogoutState.value = autoLogoutState_next;
                });

                const ctx_user = await ctx.dUser.pr;

                if (ctx_user.hasCreateUserThrown) {
                    state.value = {
                        isReady: false,
                        oidcInitializationError: ctx_user.initializationError
                    };
                    return;
                }

                state.value = {
                    isReady: true,
                    isUserLoggedIn: true,
                    oidc: ctx.oidc,
                    user: ctx_user.user
                };
            })
            .catch(error => {
                unexpectedError.value = { error };
            });

        const getLogin = (() => {
            let login: Oidc_vue.NotLoggedIn["login"] | undefined;

            return (oidc: Oidc.NotLoggedIn) =>
                (login ??= params => oidc.login({ doesCurrentHrefEnforceLogin: false, ...params }));
        })();

        function useOidc(params?: { assert?: undefined }): Oidc_vue.Ref<User>;
        function useOidc(params: { assert: "user logged in" }): Oidc_vue.LoggedIn<User>;
        function useOidc(params: { assert: "user not logged in" }): Oidc_vue.NotLoggedIn;
        function useOidc(params?: {
            assert?: "user logged in" | "user not logged in";
        }): Oidc_vue.Ref<User> | Oidc_vue.NotLoggedIn | Oidc_vue.LoggedIn<User> {
            const { assert: assert_params } = params ?? {};
            const instance = getCurrentInstance();
            const hasHydrated = shallowRef(
                assert_params !== undefined ||
                    !getIsStateDataCookieEnabled() ||
                    instance?.isMounted !== false
            );

            if (isBrowser && instance !== null && !instance.isMounted) {
                onMounted(() => {
                    triggerClientInitializationIfNotAlreadyDone();
                    hasHydrated.value = true;
                });
            }

            function getSnapshot(): Oidc_vue<User> {
                const state_current = state.value;

                if (!hasHydrated.value || !state_current.isReady) {
                    if (hasHydrated.value && unexpectedError.value !== undefined) {
                        throw unexpectedError.value.error;
                    }

                    return id<Oidc_vue.NotReady>({
                        isOidcReady: false,
                        autoLogoutState: autoLogoutState_notLoggedIn,
                        initializationError:
                            hasHydrated.value && !state_current.isReady
                                ? state_current.oidcInitializationError
                                : undefined
                    });
                }

                if (!state_current.isUserLoggedIn) {
                    return id<Oidc_vue.NotLoggedIn>({
                        isOidcReady: true,
                        isUserLoggedIn: false,
                        initializationError: state_current.oidc.initializationError,
                        issuerUri: state_current.oidc.issuerUri,
                        clientId: state_current.oidc.clientId,
                        validRedirectUri: state_current.oidc.validRedirectUri,
                        autoLogoutState: autoLogoutState_notLoggedIn,
                        login: getLogin(state_current.oidc)
                    });
                }

                return id<Oidc_vue.LoggedIn<User>>({
                    isOidcReady: true,
                    isUserLoggedIn: true,
                    issuerUri: state_current.oidc.issuerUri,
                    clientId: state_current.oidc.clientId,
                    validRedirectUri: state_current.oidc.validRedirectUri,
                    logout: state_current.oidc.logout,
                    renewTokens: state_current.oidc.renewTokens,
                    startAuthorization: state_current.oidc.startAuthorization,
                    authorizationResult: state_current.oidc.authorizationResult,
                    isNewBrowserSession: state_current.oidc.isNewBrowserSession,
                    autoLogoutState,
                    user: state_current.user,
                    refreshUser: state_current.oidc.refreshUser
                });
            }

            if (assert_params === undefined) {
                const snapshot = computed(getSnapshot);
                const field = <Key extends keyof Oidc_vue<User>>(key: Key) =>
                    computed(() => snapshot.value[key]);

                return Object.assign(snapshot, {
                    isOidcReady: field("isOidcReady"),
                    isUserLoggedIn: field("isUserLoggedIn"),
                    initializationError: field("initializationError"),
                    issuerUri: field("issuerUri"),
                    clientId: field("clientId"),
                    validRedirectUri: field("validRedirectUri"),
                    login: field("login"),
                    logout: field("logout"),
                    renewTokens: field("renewTokens"),
                    startAuthorization: field("startAuthorization"),
                    authorizationResult: field("authorizationResult"),
                    isNewBrowserSession: field("isNewBrowserSession"),
                    autoLogoutState: computed(() => snapshot.value.autoLogoutState.value),
                    user: computed(() => snapshot.value.user?.value),
                    refreshUser: field("refreshUser")
                });
            }

            const snapshot = getSnapshot();

            if (!snapshot.isOidcReady) {
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
                    if (!snapshot.isUserLoggedIn) {
                        throw new Error(getMessage("to be logged in but currently they aren't"));
                    }
                    break;
                case "user not logged in":
                    if (snapshot.isUserLoggedIn) {
                        throw new Error(getMessage("not to be logged in but currently they are"));
                    }
                    break;
                default:
                    assert<Equals<typeof assert_params, never>>(false);
            }

            return snapshot;
        }

        return { useOidc };
    })();

    let returnToUrl_temporaryOverride: string | undefined = undefined;

    let clearReturnToUrlOverride: (() => void) | undefined;

    const { getOidc } = (() => {
        let oidc_cached: Oidc<User> | undefined = undefined;
        const prClientCtx = dClientCtx.pr.catch(() => new Promise<never>(() => {}));

        function getOidc(params?: { assert?: undefined }): Promise<Oidc<User>>;
        function getOidc(params: { assert: "user logged in" }): Promise<Oidc.LoggedIn<User>>;
        function getOidc(params: { assert: "user not logged in" }): Promise<Oidc.NotLoggedIn>;
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

            const ctx = await prClientCtx;

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

            oidc_cached = (() => {
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
                        get validRedirectUri(): string {
                            return toFullyQualifiedUrl({
                                urlish: getBASE_URL_earlyInit(),
                                doAssertNoQueryParams: true,
                                doOutputWithTrailingSlash: true,
                                rootUrl_fullyQualified: window.location.origin
                            });
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

    async function enforceLogin(to: RouteLocationNormalizedGenericLike): Promise<void | never> {
        if (!isBrowser) {
            throw new Error("oidc-spa: enforceLogin cannot be used on the server");
        }

        // A new attempt supersedes any destination whose navigation was cancelled.
        clearReturnToUrlOverride?.();
        triggerClientInitializationIfNotAlreadyDone();

        const ctx = await dClientCtx.pr;

        if (!ctx.doWeHaveOidcInstance) {
            throw ctx.oidcInitializationError;
        }

        if (!ctx.isUserLoggedIn && ctx.oidc.initializationError !== undefined) {
            throw ctx.oidc.initializationError;
        }

        const returnToUrl = toFullyQualifiedUrl({
            urlish: to.fullPath,
            doAssertNoQueryParams: false,
            rootUrl_fullyQualified: ctx.oidc.validRedirectUri
        });
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

            clearReturnToUrlOverride?.();
            returnToUrl_temporaryOverride = returnToUrl;
            const history = window.history;
            const history_pushState = history.pushState;
            const history_replaceState = history.replaceState;
            const onNavigated = () => {
                history.pushState = history_pushState;
                history.replaceState = history_replaceState;
                returnToUrl_temporaryOverride = undefined;
                clearReturnToUrlOverride = undefined;
                window.removeEventListener("popstate", onNavigated);
            };
            clearReturnToUrlOverride = onNavigated;
            window.addEventListener("popstate", onNavigated);

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

    return { useOidc, getOidc, enforceLogin };
}
