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
import { defer, finalize, from, ReplaySubject, Subject, switchMap } from "rxjs";
import { setDesiredPostLoginRedirectUrl } from "../core/desiredPostLoginRedirectUrl";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import type {
    CreateUser,
    OidcService,
    OidcSpaUtils,
    OidcHelpers,
    ParamsOfProvide,
    ParamsOfProvideMock
} from "./types";
import type { Oidc as Oidc_core } from "../core";
import { OidcInitializationError } from "../core/OidcInitializationError";
import { Deferred } from "../tools/Deferred";
import { getBaseHref } from "../tools/getBaseHref";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";

export function createOidcSpaUtils<AutoLogin extends boolean, User>(params: {
    autoLogin: AutoLogin;
    providerAwaitsInitialization: boolean;
    createUser: CreateUser<User> | undefined;
    user_mock: User | undefined;
}): OidcSpaUtils<AutoLogin, User> {
    const { autoLogin, providerAwaitsInitialization, createUser, user_mock: user_mock_static } = params;

    type InitializationParams =
        | { implementation: "real"; params: ValueOrAsyncGetter<ParamsOfProvide> }
        | { implementation: "mock"; params: ParamsOfProvideMock<boolean, User> };

    // Each provider creates its own state in its Angular injection context.
    function createOidcService() {
        const injector = inject(Injector);
        const destroyRef = inject(DestroyRef);
        type Core = Oidc_core<Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec, User>;
        type ResultOfGetUser = Awaited<ReturnType<OidcService<boolean, User>["getUser"]>>;

        // Match React's separate core and user results. Authenticated HTTP must not wait for User.
        const dOidcCoreOrInitializationError = new Deferred<Core | OidcInitializationError>();
        const dResultOfGetUserOrInitializationErrorOrUndefined = new Deferred<
            ResultOfGetUser | OidcInitializationError | undefined
        >();
        const $resultOfGetUser = signal<
            { value: ResultOfGetUser | OidcInitializationError | undefined } | undefined
        >(undefined);
        const userSubject = new ReplaySubject<User>(1);
        const accessTokenRotation = new Subject<string>();
        const secondsLeftBeforeAutoLogout = signal<number | null>(null);
        const cleanups = new Set<() => void>();
        let hasStarted = false;
        let isRunningGetParams = false;
        let isEvaluatingInterceptor = false;
        let destroyed = false;

        destroyRef.onDestroy(() => {
            destroyed = true;
            cleanups.forEach(cleanup => cleanup());
            cleanups.clear();
            userSubject.complete();
            accessTokenRotation.complete();
        });

        function registerCleanup(cleanup: () => void) {
            if (destroyed) {
                cleanup();
                return;
            }
            cleanups.add(cleanup);
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
                        "In mock mode, provide user_mock in withUser() or Oidc.provideMock()."
                );
            }
            return state.value;
        }

        const prInitialized = Promise.all([
            dOidcCoreOrInitializationError.pr,
            dResultOfGetUserOrInitializationErrorOrUndefined.pr
        ]).then(() => true as const);
        const user$ = Object.assign(userSubject.asObservable(), {
            getValue: () => getResultOfGetUser().user
        });

        const oidc: OidcService<boolean, User> = {
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
                return oidcCore.login({ ...params, doesCurrentHrefRequiresAuth: false });
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
                const oidcCore = getCore("getAccessToken");
                return oidcCore.isUserLoggedIn
                    ? { isUserLoggedIn: true, accessToken: (await oidcCore.getTokens()).accessToken }
                    : { isUserLoggedIn: false };
            },
            accessTokenRotation$: accessTokenRotation.asObservable(),
            $secondsLeftBeforeAutoLogout: secondsLeftBeforeAutoLogout.asReadonly(),
            $user: computed(() => getResultOfGetUser().user),
            user$,
            async getUser() {
                await dOidcCoreOrInitializationError.pr;
                return getLoggedInCore("getUser").getUser();
            },
            async refreshUser() {
                await prInitialized;
                return getResultOfGetUser().refreshUser();
            }
        };

        function setResultOfGetUser(value: ResultOfGetUser | OidcInitializationError | undefined) {
            dResultOfGetUserOrInitializationErrorOrUndefined.resolve(value);
            $resultOfGetUser.set({ value });
            if (value instanceof OidcInitializationError) {
                userSubject.error(value);
            } else if (value === undefined) {
                userSubject.complete();
            } else {
                userSubject.next(value.user);
            }
        }

        async function initialize(initialization: InitializationParams): Promise<true> {
            if (hasStarted) {
                return prInitialized;
            }
            hasStarted = true;

            let oidcCore: Core;
            let shouldGetUser: boolean;
            let warnUserSecondsBeforeAutoLogout = 60;

            if (initialization.implementation === "mock") {
                const { createMockOidc } = await import("../core/createMockOidc");
                const params = initialization.params;
                const user_mock = params.user_mock ?? user_mock_static;
                oidcCore = await createMockOidc({
                    BASE_URL: getBaseHref(),
                    // Same type-only narrowing as React: runtime autoLogin is unchanged.
                    autoLogin: autoLogin as false,
                    isUserInitiallyLoggedIn: autoLogin || (params.isUserInitiallyLoggedIn ?? true),
                    mockedParams: { issuerUri: params.mockIssuerUri, clientId: params.mockClientId },
                    mockedTokens: { accessToken: params.mockAccessToken },
                    mockedUser: user_mock
                });
                shouldGetUser = user_mock !== undefined;
            } else {
                const paramsOrGetter = initialization.params;
                // Invoke the config getter in context, before yielding, just like an Angular initializer.
                const prParams = (async () => {
                    isRunningGetParams = true;
                    try {
                        return await (typeof paramsOrGetter === "function"
                            ? runInInjectionContext(injector, paramsOrGetter)
                            : paramsOrGetter);
                    } finally {
                        isRunningGetParams = false;
                    }
                })();
                const [{ createOidc }, { warnUserSecondsBeforeAutoLogout: warning = 60, ...params }] =
                    await Promise.all([import("../core"), prParams]);
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
                    oidcCore.subscribeToTokensChange(({ accessToken }) => {
                        accessTokenRotation.next(accessToken);
                    }).unsubscribeFromTokensChange
                );
                registerCleanup(
                    oidcCore.subscribeToAutoLogoutCountdown(({ secondsLeft }) => {
                        secondsLeftBeforeAutoLogout.set(
                            secondsLeft === undefined || secondsLeft > warnUserSecondsBeforeAutoLogout
                                ? null
                                : secondsLeft
                        );
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
                    userSubject.next(user);
                }).unsubscribeFromUserChange
            );
            setResultOfGetUser(resultOfGetUser);
            return prInitialized;
        }

        return {
            oidc,
            initialize,
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

    type Runtime = ReturnType<typeof createOidcService>;
    const runtimeToken = new InjectionToken<Runtime>("oidc-spa runtime");
    const token = new InjectionToken<OidcService<AutoLogin, User>>("Oidc");

    function provide(initialization: InitializationParams) {
        return makeEnvironmentProviders([
            { provide: runtimeToken, useFactory: createOidcService },
            { provide: token, useFactory: () => inject(runtimeToken).oidc },
            provideAppInitializer(() => {
                if (!isPlatformBrowser(inject(PLATFORM_ID))) {
                    return;
                }
                const runtime = inject(runtimeToken);
                const prInitialized = runtime.initialize(initialization);
                return providerAwaitsInitialization ? prInitialized : undefined;
            })
        ]);
    }

    const helpers: OidcHelpers<AutoLogin, User> = {
        provide: params => provide({ implementation: "real", params }),
        provideMock: (params = {}) => provide({ implementation: "mock", params }),
        createBearerInterceptor: ({ shouldInjectAccessToken }) => {
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
                                "while Oidc.provide's configuration is loading. Requests used to load that configuration " +
                                "must return false from shouldInjectAccessToken before reading authentication state."
                        );
                    }, 4_000);

                    return from(runtime.prCore).pipe(
                        switchMap(() => {
                            if (!(decision ?? evaluate())) {
                                return next(req);
                            }
                            return from(runtime.oidc.getAccessToken()).pipe(
                                switchMap(result => {
                                    if (!result.isUserLoggedIn) {
                                        throw new Error(
                                            `oidc-spa: Attempted to attach an access token to ${req.method} ${req.urlWithParams}, ` +
                                                "but the user is not logged in."
                                        );
                                    }
                                    return next(
                                        req.clone({
                                            setHeaders: {
                                                Authorization: `Bearer ${result.accessToken}`
                                            }
                                        })
                                    );
                                })
                            );
                        }),
                        finalize(() => clearTimeout(timer))
                    );
                });
            };
            return interceptor;
        },
        enforceLoginGuard: async (route, state) => {
            const runtime = inject(runtimeToken);
            const router = inject(Router);
            if (!isPlatformBrowser(inject(PLATFORM_ID))) {
                throw new Error("oidc-spa: enforceLoginGuard cannot be used on the server.");
            }

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

    // Augmenting InjectionToken<T> loses Angular's inference because T is phantom.
    // AbstractType<T> preserves it through its prototype property. This assertion is
    // only for inference: the runtime value remains an InjectionToken, resolved by
    // identity through useFactory above. It is never constructed or used as a prototype.
    return {
        Oidc: Object.assign(token, helpers) as unknown as OidcSpaUtils<AutoLogin, User>["Oidc"]
    };
}
