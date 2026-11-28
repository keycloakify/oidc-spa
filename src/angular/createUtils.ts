import { isPlatformBrowser } from "@angular/common";
import {
    APP_BOOTSTRAP_LISTENER,
    computed,
    DestroyRef,
    ErrorHandler,
    inject,
    InjectionToken,
    Injector,
    makeEnvironmentProviders,
    makeStateKey,
    PLATFORM_ID,
    provideAppInitializer,
    runInInjectionContext,
    signal,
    TransferState,
    type Signal,
    type WritableSignal
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
import type { CreateClientUser, Oidc_angular, Oidc, OidcSpaUtils, RuntimeConfigs } from "./types";
import { OidcInitializationError } from "../core/OidcInitializationError";
import { Deferred } from "../tools/Deferred";
import { assert } from "../tools/tsafe/assert";
import { id } from "../tools/tsafe/id";
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { getHomeUrlAndValidRedirectUri } from "../core/earlyInit_homeUrlAndValidRedirectUri";

const wasServerRendered = makeStateKey<boolean>("oidc-spa:angular:server-rendered");

export function createUtils<User>(params: { createUser: CreateClientUser<User> }): OidcSpaUtils<User> {
    const { createUser } = params;

    // Provider configuration stays in Angular's injection context. Imperative access belongs
    // to one active browser app; SSR requests each get an independent, pending runtime.
    let dRuntime = new Deferred<Runtime>();
    let activeRuntime: Runtime | undefined;

    function createRuntime() {
        const injector = inject(Injector);
        const destroyRef = inject(DestroyRef);
        const hasHydrated = signal(!inject(TransferState).get(wasServerRendered, false));
        const dClientCtx = new Deferred<
            | {
                  doWeHaveOidcInstance: false;
                  runtimeConfigs: Pick<RuntimeConfigs.Real, "issuerUri" | "clientId"> | undefined;
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
                            user: Signal<User>;
                        }
                  >;
              }
        >();

        dClientCtx.pr.then(
            ctx => {
                if (!ctx.doWeHaveOidcInstance) {
                    console.error(
                        `oidc-spa: ${ctx.oidcInitializationError}`,
                        ctx.oidcInitializationError
                    );
                }
            },
            // Unexpected initialization errors are handled by the existing callers.
            () => {}
        );

        type AutoLogoutState = ReturnType<Oidc_angular.LoggedIn<User>["autoLogoutState"]>;
        const autoLogoutState = signal<AutoLogoutState>({ shouldDisplayWarning: false });
        const cleanups = new Set<() => void>();
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

        const { initialize } = (() => {
            let hasStarted = false;

            function initialize(
                getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<
                    void,
                    RuntimeConfigs
                >
            ): Promise<void> {
                if (hasStarted) return prInitialized;
                hasStarted = true;

                const prInitialization = (async () => {
                    let runtimeConfigs: RuntimeConfigs;

                    isRunningGetRuntimeConfigs = true;
                    try {
                        runtimeConfigs = await (typeof getRuntimeConfigsOrRuntimeConfigs === "function"
                            ? runInInjectionContext(injector, getRuntimeConfigsOrRuntimeConfigs)
                            : getRuntimeConfigsOrRuntimeConfigs);
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
                        return;
                    } finally {
                        isRunningGetRuntimeConfigs = false;
                    }

                    if (destroyed) return;

                    switch (runtimeConfigs.mode) {
                        case "mock":
                            {
                                const { createMockOidc } = await import("../core/createMockOidc");

                                const oidc = await createMockOidc<User>({
                                    createUser_mock: params =>
                                        runInInjectionContext(injector, () =>
                                            createUser({
                                                isMock: true,
                                                ...params
                                            })
                                        ),
                                    isUserInitiallyLoggedIn:
                                        runtimeConfigs.isUserInitiallyLoggedIn ?? true,

                                    issuerUri_mock: runtimeConfigs.issuerUri_mock,
                                    clientId_mock: runtimeConfigs.clientId_mock,
                                    idTokenClaims_mock: runtimeConfigs.idTokenClaims_mock,
                                    idToken_mock: runtimeConfigs.idToken_mock,
                                    accessToken_mock: runtimeConfigs.accessToken_mock,
                                    refreshToken_mock: runtimeConfigs.refreshToken_mock
                                });

                                if (destroyed) return;

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
                                        transformAuthorizationUrl:
                                            runtimeConfigs.transformAuthorizationUrl,
                                        authorizationParams: runtimeConfigs.authorizationParams,
                                        tokenParams: runtimeConfigs.tokenParams,
                                        sessionRestorationMethod:
                                            runtimeConfigs.sessionRestorationMethod,
                                        debugLogs: runtimeConfigs.debugLogs,
                                        __oidcProviderMetadata: runtimeConfigs.__oidcProviderMetadata,
                                        autoLogout_returnToUrl: runtimeConfigs.autoLogout_returnToUrl,
                                        disableDPoP: runtimeConfigs.disableDPoP,
                                        warnUserSecondsBeforeAutoLogout:
                                            runtimeConfigs.warnUserSecondsBeforeAutoLogout,
                                        createUser: params =>
                                            runInInjectionContext(injector, () =>
                                                createUser({
                                                    isMock: false,
                                                    ...params
                                                })
                                            )
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

                                if (destroyed) return;

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
                        void dUser.pr.catch(() => {});

                        registerCleanup(
                            oidc.subscribeToAutoLogoutState(state => autoLogoutState.set(state))
                                .unsubscribeFromAutoLogoutState
                        );

                        let user: WritableSignal<User> | undefined = undefined;

                        const unsubscribeFromUserChange = registerCleanup(
                            oidc.subscribeToUserChange(({ user: user_next }) => {
                                if (destroyed) return;
                                if (user === undefined) {
                                    user = signal(user_next);
                                } else {
                                    user.set(user_next);
                                }
                            }).unsubscribeFromUserChange
                        );

                        try {
                            // Initialize from the current tokens; refreshUser() explicitly renews them.
                            const user_initial = await oidc.getUser();
                            // A cached user may be returned without a new notification.
                            user ??= signal(user_initial);
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
                            user: user.asReadonly()
                        });
                    }
                })();

                prInitialization.catch(error => {
                    const { hasResolved, value: ctx } = dClientCtx.getState();

                    if (!hasResolved) {
                        dClientCtx.reject(error);
                    } else if (ctx.doWeHaveOidcInstance && ctx.isUserLoggedIn) {
                        ctx.dUser.reject(error);
                    }
                });

                return prInitialized;
            }

            return { initialize };
        })();

        const autoLogoutState_notLoggedIn = signal({
            shouldDisplayWarning: false as const
        }).asReadonly();
        function notReady(initializationError?: OidcInitializationError): Oidc_angular.NotReady {
            return {
                isOidcReady: false,
                autoLogoutState: autoLogoutState_notLoggedIn,
                initializationError
            };
        }

        const pending = notReady();
        const state = signal<Oidc_angular<User>>(pending);
        const getSnapshot = computed(() => (hasHydrated() ? state() : pending));

        const prInitialized = (async () => {
            const ctx = await dClientCtx.pr;

            if (destroyed) return;

            if (!ctx.doWeHaveOidcInstance) {
                state.set(notReady(ctx.oidcInitializationError));
                return;
            }

            if (!ctx.isUserLoggedIn) {
                const { oidc } = ctx;
                state.set({
                    isOidcReady: true,
                    isUserLoggedIn: false,
                    issuerUri: oidc.issuerUri,
                    clientId: oidc.clientId,
                    validRedirectUri: oidc.validRedirectUri,
                    autoLogoutState: autoLogoutState_notLoggedIn,
                    initializationError: oidc.initializationError,
                    login: params => oidc.login({ doesCurrentHrefEnforceLogin: false, ...params })
                });
                return;
            }

            const { oidc, dUser } = ctx;
            const ctx_user = await dUser.pr;

            if (destroyed) return;

            if (ctx_user.hasCreateUserThrown) {
                state.set(notReady(ctx_user.initializationError));
                return;
            }

            state.set({
                isOidcReady: true,
                isUserLoggedIn: true,
                issuerUri: oidc.issuerUri,
                clientId: oidc.clientId,
                validRedirectUri: oidc.validRedirectUri,
                logout: oidc.logout,
                renewTokens: oidc.renewTokens,
                startAuthorization: oidc.startAuthorization,
                authorizationResult: oidc.authorizationResult,
                isNewBrowserSession: oidc.isNewBrowserSession,
                autoLogoutState: autoLogoutState.asReadonly(),
                user: ctx_user.user,
                refreshUser: oidc.refreshUser
            });
        })();
        void prInitialized.catch(() => {});

        // Preserve live property reads in Angular templates and injected services.
        const oidc = new Proxy({} as Oidc_angular<User>, {
            get(_target, property) {
                if (isEvaluatingInterceptor) {
                    if (property === "isUserLoggedIn") {
                        const { hasResolved, value: ctx } = dClientCtx.getState();
                        // Authentication-dependent predicates are retried once core settles.
                        if (!hasResolved) throw dClientCtx.pr;
                        return ctx.doWeHaveOidcInstance && ctx.isUserLoggedIn;
                    }
                    if (property === "user" && !state().isOidcReady) {
                        throw new Error(
                            "oidc-spa: shouldInjectAccessToken accessed the user before it was ready. " +
                                "Requests made by createUser must depend only on authentication state, not on the user being constructed."
                        );
                    }
                }
                return Reflect.get(getSnapshot(), property);
            },
            has: (_target, property) => Reflect.has(getSnapshot(), property),
            ownKeys: () => Reflect.ownKeys(getSnapshot()),
            getOwnPropertyDescriptor: (_target, property) =>
                Reflect.getOwnPropertyDescriptor(getSnapshot(), property)
        });

        const { getOidc } = (() => {
            let oidc_cached: Oidc<User> | undefined = undefined;
            // Unexpected initialization failures are reported by Angular's ErrorHandler.
            const prClientCtx = dClientCtx.pr.catch(() => new Promise<never>(() => {}));

            async function getOidc(params?: {
                assert?: "user logged in" | "user not logged in";
            }): Promise<Oidc<User>> {
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
                                try {
                                    return getHomeUrlAndValidRedirectUri().validRedirectUri;
                                } catch {
                                    return "redirect-uri-is-unknown";
                                }
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
                        },
                        subscribeToTokensChange: next => ({
                            unsubscribeFromTokensChange: registerCleanup(
                                oidc.subscribeToTokensChange(next).unsubscribeFromTokensChange
                            )
                        }),
                        subscribeToUserChange: next => ({
                            unsubscribeFromUserChange: registerCleanup(
                                oidc.subscribeToUserChange(next).unsubscribeFromUserChange
                            )
                        }),
                        subscribeToAutoLogoutState: next => ({
                            unsubscribeFromAutoLogoutState: registerCleanup(
                                oidc.subscribeToAutoLogoutState(next).unsubscribeFromAutoLogoutState
                            )
                        })
                    });

                    return oidc_proxy;
                })();

                return oidc_cached;
            }

            return { getOidc };
        })();

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
            initialize,
            getOidc,
            getSnapshot: state.asReadonly(),
            markHydrated: () => hasHydrated.set(true),
            setReturnToUrlOverride,
            prClientCtx: dClientCtx.pr,
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

    function provideOidc(
        getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>
    ) {
        return makeEnvironmentProviders([
            { provide: runtimeToken, useFactory: createRuntime },
            {
                provide: APP_BOOTSTRAP_LISTENER,
                multi: true,
                // Angular calls this after rendering the root component for the first time.
                useFactory: () => inject(runtimeToken).markHydrated
            },
            provideAppInitializer(() => {
                if (!isPlatformBrowser(inject(PLATFORM_ID))) {
                    inject(TransferState).set(wasServerRendered, true);
                    return;
                }
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
        const { oidc, getSnapshot } = inject(runtimeToken);
        if (params?.assert === undefined) return oidc;

        const snapshot = getSnapshot();
        if (!snapshot.isOidcReady) {
            throw new Error(
                `oidc-spa: Called injectOidc({ assert: '${params.assert}' }) before auth state was established. Check isOidcReady first.`
            );
        }
        if (snapshot.isUserLoggedIn !== (params.assert === "user logged in")) {
            throw new Error(
                `oidc-spa: Called injectOidc({ assert: '${params.assert}' }), but the user is ${
                    snapshot.isUserLoggedIn ? "logged in" : "not logged in"
                }.`
            );
        }
        return snapshot;
    }

    async function getOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): Promise<Oidc<User>> {
        if (typeof window === "undefined" || typeof window.document === "undefined") {
            throw new Error("oidc-spa: getOidc() can't be used on the server");
        }
        const runtime = await dRuntime.pr;
        return runtime.getOidc(params);
    }

    return {
        provideOidc,
        // @ts-expect-error: Assertion overloads are enforced at runtime.
        injectOidc,
        // @ts-expect-error: Assertion overloads are enforced at runtime.
        getOidc,
        createOidcInterceptor: ({
            shouldInjectAccessToken
        }: Parameters<OidcSpaUtils<User>["createOidcInterceptor"]>[0]) => {
            const interceptor: HttpInterceptorFn = (req, next) => {
                if (!isPlatformBrowser(inject(PLATFORM_ID))) return next(req);

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
                    if (error !== runtime.prClientCtx) throw error;
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
                    return from(runtime.prClientCtx.catch(() => undefined)).pipe(
                        switchMap(ctx => {
                            if (
                                !ctx?.doWeHaveOidcInstance ||
                                !ctx.isUserLoggedIn ||
                                !(decision ?? evaluate())
                            ) {
                                return next(req);
                            }

                            const { oidc } = ctx;
                            const prAccessToken = (async () => {
                                try {
                                    return await oidc.getAccessToken();
                                } catch (error) {
                                    if (!(error instanceof OidcInitializationError)) throw error;
                                    return undefined;
                                }
                            })();

                            return from(prAccessToken).pipe(
                                switchMap(accessToken =>
                                    next(
                                        accessToken === undefined
                                            ? req
                                            : req.clone({
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
            const ctx = await runtime.prClientCtx;
            // Angular can cancel a navigation while authentication is still pending.
            // Its guard promise continues running, so do not redirect or install an override
            // for a route that is no longer being activated.
            if (navigationId !== undefined && router.getCurrentNavigation()?.id !== navigationId)
                return true;
            if (!ctx.doWeHaveOidcInstance) {
                throw ctx.oidcInitializationError;
            }
            if (!ctx.isUserLoggedIn && ctx.oidc.initializationError !== undefined) {
                throw ctx.oidc.initializationError;
            }
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
                rootUrl_fullyQualified: getHomeUrlAndValidRedirectUri().homeUrl,
                doAssertNoQueryParams: false
            });
            const isUrlAlreadyReplaced =
                window.location.href.replace(/\/$/, "") === returnToUrl.replace(/\/$/, "");
            if (!ctx.isUserLoggedIn) {
                await ctx.oidc.login({ returnToUrl, doesCurrentHrefEnforceLogin: isUrlAlreadyReplaced });
                assert(false, "333203");
            }
            if (!isUrlAlreadyReplaced) runtime.setReturnToUrlOverride(returnToUrl, router);

            const ctx_user = await ctx.dUser.pr;
            if (navigationId !== undefined && router.getCurrentNavigation()?.id !== navigationId)
                return true;
            if (ctx_user.hasCreateUserThrown) {
                throw ctx_user.initializationError;
            }
            return true;
        }
    };
}
