import { isPlatformBrowser } from "@angular/common";
import {
    computed,
    DestroyRef,
    inject,
    InjectionToken,
    Injector,
    makeEnvironmentProviders,
    PLATFORM_ID,
    provideAppInitializer,
    runInInjectionContext,
    signal
} from "@angular/core";
import type { HttpInterceptorFn } from "@angular/common/http";
import { Router } from "@angular/router";
import { defer, finalize, from, switchMap } from "rxjs";
import { setDesiredPostLoginRedirectUrl } from "../core/desiredPostLoginRedirectUrl";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import type { CreateUser, InjectOidc, GetOidc, OidcSpaUtils, ParamsOfProvide } from "./types";
import { createStatefulEvt } from "../tools/StatefulEvt";
import type { Oidc as Oidc_core } from "../core";
import { OidcInitializationError } from "../core/OidcInitializationError";
import { Deferred } from "../tools/Deferred";
import { getBaseHref } from "../tools/getBaseHref";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";

export function createOidcSpaUtils<User, AutoLogin extends boolean>(params: {
    autoLogin: AutoLogin;
    providerAwaitsInitialization: boolean;
    createUser: CreateUser<User> | undefined;
    user_mock: User | undefined;
}): OidcSpaUtils<User, AutoLogin> {
    const { autoLogin, providerAwaitsInitialization, createUser, user_mock: user_mock_static } = params;

    // Like React's bootstrap, imperative access belongs to one active application.
    // Destroying the injector releases it so tests or a remounted app can initialize again.
    let dRuntime = new Deferred<Runtime>();
    let activeRuntime: Runtime | undefined;

    // Each provider creates its own state in its Angular injection context.
    function createRuntime() {
        const injector = inject(Injector);
        const destroyRef = inject(DestroyRef);
        type Core = Oidc_core<User>;
        type ResultOfGetUser = Awaited<ReturnType<Oidc_core.LoggedIn<User>["getUser"]>>;

        // Match React's separate core and user results. Authenticated HTTP must not wait for User.
        const dOidcCoreOrInitializationError = new Deferred<Core | OidcInitializationError>();
        const dResultOfGetUserOrInitializationErrorOrUndefined = new Deferred<
            ResultOfGetUser | OidcInitializationError | undefined
        >();
        const $resultOfGetUser = signal<
            { value: ResultOfGetUser | OidcInitializationError | undefined } | undefined
        >(undefined);
        type AutoLogoutState = ReturnType<InjectOidc.Oidc.LoggedIn<User>["autoLogoutState"]>;
        const evtAutoLogoutState = createStatefulEvt<AutoLogoutState>(() => ({
            shouldDisplayWarning: false
        }));
        const autoLogoutState = signal(evtAutoLogoutState.current);
        const cleanups = new Set<() => void>();
        let hasStarted = false;
        let isRunningGetParams = false;
        let isEvaluatingInterceptor = false;
        let destroyed = false;

        destroyRef.onDestroy(() => {
            destroyed = true;
            cleanups.forEach(cleanup => cleanup());
            cleanups.clear();
        });

        function registerCleanup(cleanup: () => void): () => void {
            let active = true;
            const unsubscribe = () => {
                if (!active) return;
                active = false;
                cleanups.delete(unsubscribe);
                cleanup();
            };
            if (destroyed) {
                unsubscribe();
            } else {
                cleanups.add(unsubscribe);
            }
            return unsubscribe;
        }

        function getCore(caller: string): Core {
            const state = dOidcCoreOrInitializationError.getState();
            if (!state.hasResolved) {
                // The interceptor can wait for this exact promise and retry its predicate.
                // Premature reads outside that internal evaluation are application errors.
                if (isEvaluatingInterceptor) {
                    throw dOidcCoreOrInitializationError.pr;
                }
                throw new Error(
                    `oidc-spa: ${caller} accessed before core authentication is ready. ` +
                        "Gate your UI with @defer (when oidc.prInitialized | async)."
                );
            }
            if (state.value instanceof OidcInitializationError) {
                throw state.value;
            }
            return state.value;
        }

        function getLoggedInCore(caller: string) {
            const oidcCore = getCore(caller);
            if (!oidcCore.isUserLoggedIn) {
                throw new Error(`oidc-spa: ${caller} called/accessed but the user is not logged in.`);
            }
            return oidcCore;
        }

        function getResultOfGetUser(): ResultOfGetUser {
            const state = $resultOfGetUser();
            if (state === undefined) {
                throw new Error(
                    isEvaluatingInterceptor
                        ? "oidc-spa: shouldInjectAccessToken accessed the user before it was ready. " +
                          "Requests made by createUser must depend only on authentication state, not on the user being constructed."
                        : "oidc-spa: User accessed before oidc.prInitialized resolved. " +
                          "Gate your UI with @defer (when oidc.prInitialized | async). " +
                          "Do not wait for the user from inside createUser."
                );
            }
            if (state.value instanceof OidcInitializationError) {
                throw state.value;
            }
            getLoggedInCore("user");
            if (state.value === undefined) {
                throw new Error(
                    "oidc-spa: Use oidcSpa.withUser({ createUser }) to implement the user abstraction. " +
                        'In mock mode, provide user_mock in withUser() or provideOidc({ implementation: "mock", ... }).'
                );
            }
            return state.value;
        }

        const prInitialized = Promise.all([
            dOidcCoreOrInitializationError.pr,
            dResultOfGetUserOrInitializationErrorOrUndefined.pr
        ]).then(() => true as const);
        const oidc: Omit<InjectOidc.Oidc.LoggedIn<User>, "isUserLoggedIn"> & {
            isUserLoggedIn: boolean;
            login: InjectOidc.Oidc.NotLoggedIn["login"];
        } = {
            prInitialized,
            get initializationError() {
                const coreState = dOidcCoreOrInitializationError.getState();
                if (coreState.hasResolved && coreState.value instanceof OidcInitializationError) {
                    return coreState.value;
                }
                const userState = $resultOfGetUser();
                if (userState === undefined) {
                    throw new Error(
                        "oidc-spa: initializationError accessed before oidc.prInitialized resolved."
                    );
                }
                if (userState.value instanceof OidcInitializationError) {
                    return userState.value;
                }
                const oidcCore = getCore("initializationError");
                return oidcCore.isUserLoggedIn ? undefined : oidcCore.initializationError;
            },
            get issuerUri() {
                return getCore("issuerUri").issuerUri;
            },
            get clientId() {
                return getCore("clientId").clientId;
            },
            get validRedirectUri() {
                return getCore("validRedirectUri").validRedirectUri;
            },
            get isUserLoggedIn() {
                return getCore("isUserLoggedIn").isUserLoggedIn;
            },
            get isNewBrowserSession() {
                return getLoggedInCore("isNewBrowserSession").isNewBrowserSession;
            },
            get backFromAuthServer() {
                return getLoggedInCore("backFromAuthServer").backFromAuthServer;
            },
            async login(params) {
                await dOidcCoreOrInitializationError.pr;
                const oidcCore = getCore("login");
                if (oidcCore.isUserLoggedIn) {
                    throw new Error(
                        "oidc-spa: login() called while already logged in. Use goToAuthServer() instead."
                    );
                }
                return oidcCore.login({ doesCurrentHrefRequiresAuth: false, ...params });
            },
            async logout(params) {
                await dOidcCoreOrInitializationError.pr;
                return getLoggedInCore("logout").logout(params);
            },
            async renewTokens(params) {
                await dOidcCoreOrInitializationError.pr;
                return getLoggedInCore("renewTokens").renewTokens(params);
            },
            async goToAuthServer(params) {
                await dOidcCoreOrInitializationError.pr;
                return getLoggedInCore("goToAuthServer").goToAuthServer(params);
            },
            async getAccessToken() {
                await dOidcCoreOrInitializationError.pr;
                return getLoggedInCore("getAccessToken").getAccessToken();
            },
            autoLogoutState: autoLogoutState.asReadonly(),
            user: computed(() => getResultOfGetUser().user),
            async refreshUser() {
                await prInitialized;
                return getResultOfGetUser().refreshUser();
            }
        };

        function setResultOfGetUser(value: ResultOfGetUser | OidcInitializationError | undefined) {
            dResultOfGetUserOrInitializationErrorOrUndefined.resolve(value);
            $resultOfGetUser.set({ value });
        }

        async function initialize(
            paramsOrGetter: ValueOrAsyncGetter<ParamsOfProvide<User, AutoLogin>>
        ): Promise<true> {
            if (hasStarted) {
                return prInitialized;
            }
            hasStarted = true;

            let oidcCore: Core;
            let shouldGetUser: boolean;
            let warnUserSecondsBeforeAutoLogout = 60;

            // Invoke the config callback synchronously in Angular's injection context.
            isRunningGetParams = true;
            let paramsOfProvide: ParamsOfProvide<User, AutoLogin>;
            try {
                paramsOfProvide = await (typeof paramsOrGetter === "function"
                    ? runInInjectionContext(injector, paramsOrGetter)
                    : paramsOrGetter);
            } finally {
                isRunningGetParams = false;
            }

            if (paramsOfProvide.implementation === "mock") {
                const { createMockOidc } = await import("../core/createMockOidc");
                const user_mock = paramsOfProvide.user_mock ?? user_mock_static;
                oidcCore = await createMockOidc({
                    BASE_URL: getBaseHref(),
                    autoLogin: autoLogin as false,
                    isUserInitiallyLoggedIn:
                        autoLogin || (paramsOfProvide.isUserInitiallyLoggedIn ?? false),
                    issuerUri_mock: paramsOfProvide.issuerUri_mock,
                    clientId_mock: paramsOfProvide.clientId_mock,
                    decodedIdToken_mock: paramsOfProvide.decodedIdToken_mock,
                    user_mock
                });
                shouldGetUser = user_mock !== undefined;
            } else {
                const { createOidc } = await import("../core");
                const {
                    implementation,
                    warnUserSecondsBeforeAutoLogout: warning = 60,
                    ...params
                } = paramsOfProvide;
                warnUserSecondsBeforeAutoLogout = warning;
                const paramsOfCreateOidc = {
                    ...params,
                    BASE_URL: getBaseHref(),
                    autoLogin,
                    createUser:
                        createUser === undefined
                            ? undefined
                            : (params: Parameters<typeof createUser>[0]) =>
                                  runInInjectionContext(injector, () => createUser(params))
                };
                try {
                    oidcCore = await createOidc(paramsOfCreateOidc);
                } catch (error) {
                    // Core throws OidcInitializationError for authentication failure with auto-login.
                    // Programming errors and other unexpected failures must propagate unchanged.
                    if (!(error instanceof OidcInitializationError)) {
                        throw error;
                    }
                    dOidcCoreOrInitializationError.resolve(error);
                    setResultOfGetUser(error);
                    return prInitialized;
                }
                shouldGetUser = createUser !== undefined;
            }

            dOidcCoreOrInitializationError.resolve(oidcCore);
            if (destroyed) {
                setResultOfGetUser(undefined);
                return prInitialized;
            }

            if (oidcCore.isUserLoggedIn) {
                registerCleanup(
                    oidcCore.subscribeToAutoLogoutCountdown(({ secondsLeft }) => {
                        const newState: AutoLogoutState =
                            secondsLeft === undefined || secondsLeft > warnUserSecondsBeforeAutoLogout
                                ? { shouldDisplayWarning: false }
                                : {
                                      shouldDisplayWarning: true,
                                      secondsLeftBeforeAutoLogout: secondsLeft
                                  };
                        if (
                            !newState.shouldDisplayWarning &&
                            !evtAutoLogoutState.current.shouldDisplayWarning
                        ) {
                            return;
                        }
                        autoLogoutState.set(newState);
                        evtAutoLogoutState.current = newState;
                    }).unsubscribeFromAutoLogoutCountdown
                );
            }

            if (!oidcCore.isUserLoggedIn || !shouldGetUser) {
                setResultOfGetUser(undefined);
                return prInitialized;
            }

            let resultOfGetUser: ResultOfGetUser;
            try {
                resultOfGetUser = await oidcCore.getUser();
            } catch (error) {
                // Same initial-createUser error contract as the React adapter.
                setResultOfGetUser(
                    new OidcInitializationError({
                        isAuthServerLikelyDown: false,
                        messageOrCause: new Error(
                            "The initial invocation of createUser threw an error",
                            // @ts-expect-error ES2022 Error.cause
                            { cause: error instanceof Error ? error : new Error(`${error}`) }
                        )
                    })
                );
                return prInitialized;
            }

            registerCleanup(
                resultOfGetUser.subscribeToUserChange(({ user }) => {
                    // React keeps this result current too. Angular's signal only notifies its consumers.
                    resultOfGetUser.user = user;
                    $resultOfGetUser.set({ value: resultOfGetUser });
                }).unsubscribeFromUserChange
            );
            setResultOfGetUser(resultOfGetUser);
            return prInitialized;
        }

        // Same imperative surface and token readiness as React's getOidc.
        async function getOidc(params?: {
            assert?: "user logged in" | "user not logged in";
        }): Promise<GetOidc.Oidc<User>> {
            const oidcCore = await dOidcCoreOrInitializationError.pr;
            if (oidcCore instanceof OidcInitializationError) {
                return new Promise<never>(() => {});
            }
            checkAssertion(oidcCore.isUserLoggedIn, params?.assert, "getOidc");
            const common = {
                issuerUri: oidcCore.issuerUri,
                clientId: oidcCore.clientId,
                validRedirectUri: oidcCore.validRedirectUri
            };
            return oidcCore.isUserLoggedIn
                ? {
                      ...common,
                      isUserLoggedIn: true,
                      getAccessToken: oidcCore.getAccessToken,
                      getDecodedIdToken: oidcCore.getDecodedIdToken,
                      subscribeToTokenRotation: next => {
                          const { unsubscribeFromTokensChange } = oidcCore.subscribeToTokensChange(
                              ({ accessToken, decodedIdToken }) => {
                                  next({ accessToken, decodedIdToken });
                              }
                          );
                          return {
                              unsubscribeFromTokenRotation: registerCleanup(unsubscribeFromTokensChange)
                          };
                      },
                      logout: oidcCore.logout,
                      renewTokens: oidcCore.renewTokens,
                      goToAuthServer: oidcCore.goToAuthServer,
                      backFromAuthServer: oidcCore.backFromAuthServer,
                      isNewBrowserSession: oidcCore.isNewBrowserSession,
                      subscribeToAutoLogoutState: next => {
                          next(evtAutoLogoutState.current);
                          const { unsubscribe } = evtAutoLogoutState.subscribe(next);
                          return { unsubscribeFromAutoLogoutState: registerCleanup(unsubscribe) };
                      },
                      getUser: oidcCore.getUser
                  }
                : {
                      ...common,
                      isUserLoggedIn: false,
                      initializationError: oidcCore.initializationError,
                      login: oidcCore.login
                  };
        }

        return {
            oidc,
            initialize,
            getOidc,
            getCore,
            prCore: dOidcCoreOrInitializationError.pr,
            get isRunningGetParams() {
                return isRunningGetParams;
            },
            evaluateInterceptor<T>(callback: () => T): T {
                const previous = isEvaluatingInterceptor;
                isEvaluatingInterceptor = true;
                try {
                    return callback();
                } finally {
                    isEvaluatingInterceptor = previous;
                }
            }
        };
    }

    type Runtime = ReturnType<typeof createRuntime>;
    const runtimeToken = new InjectionToken<Runtime>("oidc-spa runtime");
    function checkAssertion(
        isUserLoggedIn: boolean,
        assertion: "user logged in" | "user not logged in" | undefined,
        caller: string
    ) {
        if (assertion === undefined) return;
        if (isUserLoggedIn !== (assertion === "user logged in")) {
            throw new Error(
                `oidc-spa: Called ${caller}({ assert: '${assertion}' }), but the user is ${
                    isUserLoggedIn ? "logged in" : "not logged in"
                }.`
            );
        }
    }

    function provideOidc(params: ValueOrAsyncGetter<ParamsOfProvide<User, AutoLogin>>) {
        return makeEnvironmentProviders([
            { provide: runtimeToken, useFactory: createRuntime },
            provideAppInitializer(() => {
                if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
                const runtime = inject(runtimeToken);
                if (activeRuntime !== undefined && activeRuntime !== runtime) {
                    throw new Error(
                        "oidc-spa: Each createUtils() instance supports one active application injector. Call createUtils() separately for independent applications."
                    );
                }
                if (activeRuntime === undefined) {
                    activeRuntime = runtime;
                    dRuntime.resolve(runtime);
                    inject(DestroyRef).onDestroy(() => {
                        activeRuntime = undefined;
                        dRuntime = new Deferred<Runtime>();
                    });
                }
                const prInitialized = runtime.initialize(params);
                return providerAwaitsInitialization ? prInitialized : undefined;
            })
        ]);
    }

    function injectOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): InjectOidc.Oidc<User> {
        const { oidc } = inject(runtimeToken);
        if (params?.assert !== undefined) {
            checkAssertion(oidc.isUserLoggedIn, params.assert, "injectOidc");
        }
        // Also available during SSR, where prInitialized stays pending and auth UI is deferred.
        // The getters enforce readiness; merely injecting the object does not read auth state.
        return oidc as unknown as InjectOidc.Oidc<User>;
    }

    async function getOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): Promise<GetOidc.Oidc<User>> {
        if (typeof window === "undefined" || typeof window.document === "undefined") {
            throw new Error("oidc-spa: getOidc() cannot be used on the server.");
        }
        const runtime = await dRuntime.pr;
        return runtime.getOidc(params);
    }

    const utils = {
        provideOidc,
        injectOidc,
        getOidc,
        createOidcInterceptor: ({
            shouldInjectAccessToken
        }: Parameters<OidcSpaUtils<User, AutoLogin>["createOidcInterceptor"]>[0]) => {
            const interceptor: HttpInterceptorFn = (req, next) => {
                const runtime = inject(runtimeToken);
                const injector = inject(Injector);

                const evaluate = () =>
                    runInInjectionContext(injector, () =>
                        runtime.evaluateInterceptor(() => shouldInjectAccessToken(req))
                    );

                let decision: boolean | undefined;
                try {
                    decision = evaluate();
                } catch (error) {
                    if (error !== runtime.prCore) {
                        throw error;
                    }
                }

                // In particular, allow the HTTP request that loads runtime configuration through.
                if (decision === false) {
                    return next(req);
                }

                return defer(() => {
                    const timer = setTimeout(() => {
                        if (!runtime.isRunningGetParams) {
                            return;
                        }
                        console.warn(
                            `oidc-spa: Probable deadlock: ${req.method} ${req.urlWithParams} is waiting for authentication ` +
                                "while provideOidc's configuration is loading. Requests used to load that configuration " +
                                "must return false from shouldInjectAccessToken before reading authentication state."
                        );
                    }, 4_000);

                    return from(runtime.prCore).pipe(
                        switchMap(() => {
                            if (!(decision ?? evaluate())) {
                                return next(req);
                            }
                            const oidcCore = runtime.getCore("createOidcInterceptor");
                            if (!oidcCore.isUserLoggedIn) {
                                throw new Error(
                                    `oidc-spa: Attempted to attach an access token to ${req.method} ${req.urlWithParams}, but the user is not logged in.`
                                );
                            }
                            return from(oidcCore.getAccessToken()).pipe(
                                switchMap(accessToken =>
                                    next(
                                        req.clone({
                                            setHeaders: { Authorization: `Bearer ${accessToken}` }
                                        })
                                    )
                                )
                            );
                        }),
                        finalize(() => clearTimeout(timer))
                    );
                });
            };
            return interceptor;
        },
        enforceLoginGuard: async (
            route: Parameters<import("@angular/router").CanActivateFn>[0],
            state?: Parameters<import("@angular/router").CanActivateFn>[1]
        ): Promise<true> => {
            if (!isPlatformBrowser(inject(PLATFORM_ID))) {
                throw new Error(
                    "oidc-spa: enforceLoginGuard cannot run during server-side rendering. " +
                        "Configure this route with renderMode: RenderMode.Client in your server routes configuration (app.routes.server.ts)."
                );
            }
            const runtime = inject(runtimeToken);
            const router = inject(Router);

            await runtime.oidc.prInitialized;
            const oidcCore = runtime.getCore("enforceLoginGuard");
            // An initial user-build error must not let a protected component render with no User.
            if (oidcCore.isUserLoggedIn && runtime.oidc.initializationError !== undefined) {
                throw runtime.oidc.initializationError;
            }

            const redirectUrl = toFullyQualifiedUrl({
                urlish:
                    state?.url ??
                    router.serializeUrl(
                        router.createUrlTree(
                            route.pathFromRoot.flatMap(snapshot =>
                                snapshot.url.map(segment => segment.path)
                            ),
                            { queryParams: route.queryParams, fragment: route.fragment ?? undefined }
                        )
                    ),
                doAssertNoQueryParams: false
            });
            const isUrlAlreadyReplaced =
                window.location.href.replace(/\/$/, "") === redirectUrl.replace(/\/$/, "");

            if (!oidcCore.isUserLoggedIn) {
                await oidcCore.login({ doesCurrentHrefRequiresAuth: isUrlAlreadyReplaced, redirectUrl });
            }

            if (!isUrlAlreadyReplaced) {
                setDesiredPostLoginRedirectUrl({ postLoginRedirectUrl: redirectUrl });
                const history_pushState = history.pushState;
                const history_replaceState = history.replaceState;
                const onNavigated = () => {
                    history.pushState = history_pushState;
                    history.replaceState = history_replaceState;
                    setDesiredPostLoginRedirectUrl({ postLoginRedirectUrl: undefined });
                };
                history.pushState = function (...args) {
                    onNavigated();
                    return history_pushState.apply(this, args);
                };
                history.replaceState = function (...args) {
                    onNavigated();
                    return history_replaceState.apply(this, args);
                };
            }
            return true;
        }
    };

    if (autoLogin) {
        const { enforceLoginGuard, ...utilsWithAutoLogin } = utils;
        return utilsWithAutoLogin as OidcSpaUtils<User, AutoLogin>;
    }
    return utils as OidcSpaUtils<User, AutoLogin>;
}
