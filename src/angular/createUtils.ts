import { isPlatformBrowser } from "@angular/common";
import {
    computed,
    DestroyRef,
    ErrorHandler,
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
import {
    NavigationCancel,
    NavigationEnd,
    NavigationError,
    NavigationSkipped,
    Router
} from "@angular/router";
import { defer, finalize, from, switchMap } from "rxjs";
import type { CreateClientUser, Oidc_angular, Oidc_client, OidcSpaUtils, RuntimeConfigs } from "./types";
import type { Oidc as Oidc_core } from "../core";
import { OidcInitializationError } from "../core/OidcInitializationError";
import { Deferred } from "../tools/Deferred";
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";

export function createUtils<User, AutoLogin extends boolean>(params: {
    autoLogin: AutoLogin;
    providerAwaitsInitialization: boolean;
    createUser: CreateClientUser<User>;
}): OidcSpaUtils<User, AutoLogin> {
    const { autoLogin, providerAwaitsInitialization, createUser } = params;

    // Provider configuration stays in Angular's injection context. Imperative access belongs
    // to one active browser app; SSR requests each get an independent, pending runtime.
    let dRuntime = new Deferred<Runtime>();
    let activeRuntime: Runtime | undefined;

    function createRuntime() {
        const injector = inject(Injector);
        const destroyRef = inject(DestroyRef);
        const dClientCtx = new Deferred<Oidc_core<User> | OidcInitializationError>();
        const dUser = new Deferred<void>();
        const initialized = signal(false);
        // A wrapper allows even undefined to be a successfully created User.
        const userState = signal<{ user: User } | OidcInitializationError | undefined>(undefined);
        type AutoLogoutState = ReturnType<Oidc_angular.LoggedIn<User>["autoLogoutState"]>;
        const autoLogoutState = signal<AutoLogoutState>({ shouldDisplayWarning: false });
        const cleanups = new Set<() => void>();
        let hasStarted = false;
        let isRunningGetRuntimeConfigs = false;
        let isEvaluatingInterceptor = false;
        let destroyed = false;
        let returnToUrl_temporaryOverride: string | undefined;
        let clearReturnToUrlOverride: (() => void) | undefined;

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

        function getClientCtx(caller: string) {
            const state = dClientCtx.getState();
            if (!state.hasResolved) {
                // Only the interceptor retries pending auth reads. Application reads must be gated.
                if (isEvaluatingInterceptor) throw dClientCtx.pr;
                throw new Error(
                    `oidc-spa: ${caller} accessed before core authentication is ready. ` +
                        "Gate your UI with @defer (when oidc.prInitialized | async)."
                );
            }
            return state.value;
        }

        function getCore(caller: string): Oidc_core<User> {
            const ctx = getClientCtx(caller);
            if (ctx instanceof OidcInitializationError) throw ctx;
            return ctx;
        }

        function getLoggedInCore(caller: string) {
            const oidc = getCore(caller);
            if (!oidc.isUserLoggedIn) {
                throw new Error(`oidc-spa: ${caller} called/accessed but the user is not logged in.`);
            }
            return oidc;
        }

        function getInitializationError(): OidcInitializationError | undefined {
            // Track user initialization, including failures before core could return a client.
            initialized();
            const state = userState();
            const ctx = getClientCtx("initializationError");
            if (ctx instanceof OidcInitializationError) return ctx;
            if (!ctx.isUserLoggedIn) return ctx.initializationError;
            if (state === undefined) {
                throw new Error(
                    "oidc-spa: initializationError accessed before oidc.prInitialized resolved."
                );
            }
            return state instanceof OidcInitializationError ? state : undefined;
        }

        const initializationError = computed(getInitializationError);
        const prInitialized = Promise.all([dClientCtx.pr, dUser.pr]).then(() => true as const);

        const oidc: Omit<Oidc_angular.LoggedIn<User>, "isUserLoggedIn"> & {
            isUserLoggedIn: boolean;
            login: Oidc_angular.NotLoggedIn["login"];
            readonly initializationError: OidcInitializationError | undefined;
        } = {
            prInitialized,
            get initializationError() {
                return getInitializationError();
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
                const ctx = getClientCtx("isUserLoggedIn");
                const state = userState();
                const error =
                    ctx instanceof OidcInitializationError
                        ? ctx
                        : state instanceof OidcInitializationError
                        ? state
                        : undefined;
                if (error !== undefined) {
                    if (autoLogin) {
                        throw new Error(
                            "oidc-spa: OIDC initialization failed. Check the signal returned by " +
                                "injectOidcInitializationError() before rendering authenticated UI.",
                            // @ts-expect-error ES2022 Error.cause
                            { cause: error }
                        );
                    }
                    return false;
                }
                return (ctx as Oidc_core<User>).isUserLoggedIn;
            },
            get isNewBrowserSession() {
                return getLoggedInCore("isNewBrowserSession").isNewBrowserSession;
            },
            get authorizationResult() {
                return getLoggedInCore("authorizationResult").authorizationResult;
            },
            async login({ doesCurrentHrefEnforceLogin = false, ...rest } = {}) {
                await prInitialized;
                const ctx = getClientCtx("login");
                if (ctx instanceof OidcInitializationError) {
                    window.alert("Authentication is currently unavailable. Please try again later.");
                    return new Promise<never>(() => {});
                }
                if (ctx.isUserLoggedIn) {
                    if (getInitializationError() !== undefined) {
                        console.warn(
                            "oidc-spa: The user object could not be constructed, reloading the page."
                        );
                        window.location.reload();
                        return new Promise<never>(() => {});
                    }
                    throw new Error(
                        "oidc-spa: login() called while already logged in. Use startAuthorization() instead."
                    );
                }
                return ctx.login({ ...rest, doesCurrentHrefEnforceLogin });
            },
            async logout(params) {
                await dClientCtx.pr;
                return getLoggedInCore("logout").logout(params);
            },
            async renewTokens() {
                await dClientCtx.pr;
                return getLoggedInCore("renewTokens").renewTokens();
            },
            async startAuthorization(params) {
                await dClientCtx.pr;
                return getLoggedInCore("startAuthorization").startAuthorization(params);
            },
            autoLogoutState: computed(() =>
                userState() instanceof OidcInitializationError
                    ? { shouldDisplayWarning: false as const }
                    : autoLogoutState()
            ),
            user: computed(() => {
                const state = userState();
                if (state === undefined) {
                    if (initialized()) getLoggedInCore("user");
                    throw new Error(
                        isEvaluatingInterceptor
                            ? "oidc-spa: shouldInjectAccessToken accessed the user before it was ready. " +
                              "Requests made by createUser must depend only on authentication state, not on the user being constructed."
                            : "oidc-spa: User accessed before oidc.prInitialized resolved. " +
                              "Gate your UI with @defer (when oidc.prInitialized | async). " +
                              "Do not wait for the user from inside createUser."
                    );
                }
                if (state instanceof OidcInitializationError) throw state;
                getLoggedInCore("user");
                return state.user;
            }),
            async refreshUser() {
                await prInitialized;
                const error = getInitializationError();
                if (error !== undefined) throw error;
                return getLoggedInCore("refreshUser").refreshUser();
            }
        };

        function completeUserInitialization(error?: OidcInitializationError) {
            if (error !== undefined) userState.set(error);
            initialized.set(true);
            dUser.resolve();
        }

        async function initialize(
            getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>
        ): Promise<true> {
            if (hasStarted) return prInitialized;
            hasStarted = true;

            let runtimeConfigs: RuntimeConfigs;
            isRunningGetRuntimeConfigs = true;
            try {
                runtimeConfigs = await (typeof getRuntimeConfigsOrRuntimeConfigs === "function"
                    ? runInInjectionContext(injector, getRuntimeConfigsOrRuntimeConfigs)
                    : getRuntimeConfigsOrRuntimeConfigs);
            } catch (error) {
                const initializationError = new OidcInitializationError({
                    isAuthServerLikelyDown: false,
                    messageOrCause: new Error(
                        "Error thrown while evaluating the runtime configs getter on the client",
                        // @ts-expect-error ES2022 Error.cause
                        { cause: error }
                    )
                });
                dClientCtx.resolve(initializationError);
                completeUserInitialization(initializationError);
                return prInitialized;
            } finally {
                isRunningGetRuntimeConfigs = false;
            }

            if (destroyed) return prInitialized;

            let oidcCore: Oidc_core<User>;
            switch (runtimeConfigs.mode) {
                case "mock": {
                    const { createMockOidc } = await import("../core/createMockOidc");
                    oidcCore = await createMockOidc<User>({
                        createUser_mock: params =>
                            runInInjectionContext(injector, () =>
                                createUser({ isMock: true, ...params })
                            ),
                        // Preserve the discriminated return type while passing the actual auto-login setting.
                        autoLogin: autoLogin as false,
                        isUserInitiallyLoggedIn: runtimeConfigs.isUserInitiallyLoggedIn ?? true,
                        issuerUri_mock: runtimeConfigs.issuerUri_mock,
                        clientId_mock: runtimeConfigs.clientId_mock,
                        idTokenClaims_mock: runtimeConfigs.idTokenClaims_mock,
                        idToken_mock: runtimeConfigs.idToken_mock,
                        accessToken_mock: runtimeConfigs.accessToken_mock,
                        refreshToken_mock: runtimeConfigs.refreshToken_mock
                    });
                    break;
                }
                case "real": {
                    const { createOidc } = await import("../core");
                    const { mode, ...configs } = runtimeConfigs;
                    try {
                        oidcCore = await createOidc<User, AutoLogin>({
                            ...configs,
                            autoLogin,
                            createUser: params =>
                                runInInjectionContext(injector, () =>
                                    createUser({ isMock: false, ...params })
                                )
                        });
                    } catch (error) {
                        if (!(error instanceof OidcInitializationError)) throw error;
                        dClientCtx.resolve(error);
                        completeUserInitialization(error);
                        return prInitialized;
                    }
                    break;
                }
            }

            dClientCtx.resolve(oidcCore);
            if (destroyed || !oidcCore.isUserLoggedIn) {
                completeUserInitialization();
                return prInitialized;
            }

            registerCleanup(
                oidcCore.subscribeToAutoLogoutState(state => autoLogoutState.set(state))
                    .unsubscribeFromAutoLogoutState
            );
            // Subscribe before getUser(): core publishes the first user through this callback.
            // Token access is already available, including to HttpClient requests inside createUser.
            const unsubscribeFromUserChange = registerCleanup(
                oidcCore.subscribeToUserChange(({ user }) => {
                    if (!destroyed) userState.set({ user });
                }).unsubscribeFromUserChange
            );
            try {
                await oidcCore.getUser();
            } catch (error) {
                unsubscribeFromUserChange();
                if (!(error instanceof OidcInitializationError)) throw error;
                completeUserInitialization(error);
                return prInitialized;
            }
            completeUserInitialization();
            return prInitialized;
        }

        let oidc_cached: Oidc_client<User> | undefined;
        async function getOidc(params?: {
            assert?: "user logged in" | "user not logged in";
        }): Promise<Oidc_client<User>> {
            const ctx = await dClientCtx.pr;
            // Match React's escape hatch: UI handles initialization errors; imperative callers wait.
            if (ctx instanceof OidcInitializationError) return new Promise<never>(() => {});
            checkAssertion(ctx.isUserLoggedIn, params?.assert, "getOidc");
            if (oidc_cached !== undefined) return oidc_cached;
            if (!ctx.isUserLoggedIn) return (oidc_cached = ctx);

            const oidc_proxy: Oidc_client.LoggedIn<User> = {
                ...ctx,
                getTokens: params =>
                    params === undefined
                        ? ctx.getTokens()
                        : ctx.getTokens({
                              ...params,
                              returnToUrl: params.returnToUrl ?? returnToUrl_temporaryOverride
                          }),
                getAccessToken: async params => (await oidc_proxy.getTokens(params)).accessToken,
                subscribeToTokensChange: next => ({
                    unsubscribeFromTokensChange: registerCleanup(
                        ctx.subscribeToTokensChange(next).unsubscribeFromTokensChange
                    )
                }),
                subscribeToUserChange: next => ({
                    unsubscribeFromUserChange: registerCleanup(
                        ctx.subscribeToUserChange(next).unsubscribeFromUserChange
                    )
                }),
                subscribeToAutoLogoutState: next => ({
                    unsubscribeFromAutoLogoutState: registerCleanup(
                        ctx.subscribeToAutoLogoutState(next).unsubscribeFromAutoLogoutState
                    )
                })
            };
            return (oidc_cached = oidc_proxy);
        }

        function setReturnToUrlOverride(returnToUrl: string, router: Router) {
            clearReturnToUrlOverride?.();
            returnToUrl_temporaryOverride = returnToUrl;
            // Angular's navigation events also clear the override when a navigation is cancelled
            // or fails, cases where history.pushState/replaceState are never called.
            const subscription = router.events.subscribe(event => {
                if (
                    event instanceof NavigationEnd ||
                    event instanceof NavigationCancel ||
                    event instanceof NavigationError ||
                    event instanceof NavigationSkipped
                )
                    clearReturnToUrlOverride?.();
            });
            clearReturnToUrlOverride = registerCleanup(() => {
                subscription.unsubscribe();
                returnToUrl_temporaryOverride = undefined;
                clearReturnToUrlOverride = undefined;
            });
        }

        return {
            oidc,
            initializationError,
            initialize,
            getOidc,
            getCore,
            setReturnToUrlOverride,
            prCore: dClientCtx.pr,
            get isRunningGetRuntimeConfigs() {
                return isRunningGetRuntimeConfigs;
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
        if (assertion !== undefined && isUserLoggedIn !== (assertion === "user logged in")) {
            throw new Error(
                `oidc-spa: Called ${caller}({ assert: '${assertion}' }), but the user is ${
                    isUserLoggedIn ? "logged in" : "not logged in"
                }.`
            );
        }
    }

    function provideOidc(
        getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>
    ) {
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
                const prInitialized = runtime.initialize(getRuntimeConfigsOrRuntimeConfigs);
                if (providerAwaitsInitialization) return prInitialized;
                const errorHandler = inject(ErrorHandler, { optional: true });
                void prInitialized.catch(error => {
                    if (errorHandler !== null) {
                        errorHandler.handleError(error);
                    } else {
                        console.error(error);
                    }
                });
            })
        ]);
    }

    function injectOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): Oidc_angular<User> {
        const { oidc } = inject(runtimeToken);
        if (params?.assert !== undefined) {
            checkAssertion(oidc.isUserLoggedIn, params.assert, "injectOidc");
        }
        return oidc as unknown as Oidc_angular<User>;
    }

    async function getOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): Promise<Oidc_client<User>> {
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
        injectOidcInitializationError: () => inject(runtimeToken).initializationError,
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
                    if (error !== runtime.prCore) throw error;
                }
                if (decision === false) return next(req);

                return defer(() => {
                    const timer = setTimeout(() => {
                        if (!runtime.isRunningGetRuntimeConfigs) return;
                        console.warn(
                            `oidc-spa: Probable deadlock: ${req.method} ${req.urlWithParams} is waiting for authentication ` +
                                "while provideOidc's configuration is loading. Requests used to load that configuration " +
                                "must return false from shouldInjectAccessToken before reading authentication state."
                        );
                    }, 4_000);
                    return from(runtime.prCore).pipe(
                        switchMap(() => {
                            if (!(decision ?? evaluate())) return next(req);
                            const oidc = runtime.getCore("createOidcInterceptor");
                            if (!oidc.isUserLoggedIn) {
                                throw new Error(
                                    `oidc-spa: Attempted to attach an access token to ${req.method} ${req.urlWithParams}, but the user is not logged in.`
                                );
                            }
                            return from(oidc.getAccessToken()).pipe(
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
            const navigationId = router.getCurrentNavigation()?.id;
            const oidc = await runtime.getOidc();
            // Angular can cancel a navigation while authentication is still pending.
            // Its guard promise continues running, so do not redirect or install an override
            // for a route that is no longer being activated.
            if (navigationId !== undefined && router.getCurrentNavigation()?.id !== navigationId)
                return true;
            const returnToUrl = toFullyQualifiedUrl({
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
                rootUrl_fullyQualified: oidc.validRedirectUri,
                doAssertNoQueryParams: false
            });
            const isUrlAlreadyReplaced =
                window.location.href.replace(/\/$/, "") === returnToUrl.replace(/\/$/, "");
            if (!oidc.isUserLoggedIn) {
                await oidc.login({ returnToUrl, doesCurrentHrefEnforceLogin: isUrlAlreadyReplaced });
            }
            if (!isUrlAlreadyReplaced) runtime.setReturnToUrlOverride(returnToUrl, router);

            // Angular cannot suspend a component reading the user. Wait before activating it.
            await runtime.oidc.prInitialized;
            const error = runtime.initializationError();
            if (error !== undefined) throw error;
            return true;
        }
    };

    if (autoLogin) {
        const { enforceLoginGuard, ...utilsWithAutoLogin } = utils;
        return utilsWithAutoLogin as unknown as OidcSpaUtils<User, AutoLogin>;
    }
    const { injectOidcInitializationError, ...utilsWithoutAutoLogin } = utils;
    return utilsWithoutAutoLogin as unknown as OidcSpaUtils<User, AutoLogin>;
}
