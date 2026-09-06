import { computed, DestroyRef, inject, Injector, runInInjectionContext, signal } from "@angular/core";
import { ReplaySubject, Subject } from "rxjs";
import type { Oidc as OidcCore } from "../core";
import { OidcInitializationError } from "../core/OidcInitializationError";
import { Deferred } from "../tools/Deferred";
import { getBaseHref } from "../tools/getBaseHref";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";
import type { BuilderParams } from "./utilsBuilder";
import type { OidcService, ParamsOfProvide, ParamsOfProvideMock } from "./types";

export type InitializationParams<User> =
    | { implementation: "real"; params: ValueOrAsyncGetter<ParamsOfProvide> }
    | { implementation: "mock"; params: ParamsOfProvideMock<boolean, User> };

export function createOidcService<User>(builder: BuilderParams<boolean, User>) {
    const injector = inject(Injector);
    const destroyRef = inject(DestroyRef);
    type Core = OidcCore<OidcCore.Tokens.DecodedIdToken_OidcCoreSpec, User>;
    type UserResult = Awaited<ReturnType<OidcService<boolean, User>["getUser"]>>;

    // Match React's separate core and user results. Authenticated HTTP must not wait for User.
    const dCore = new Deferred<Core | OidcInitializationError>();
    const dUser = new Deferred<UserResult | OidcInitializationError | undefined>();
    const $userResult = signal<{ value: UserResult | OidcInitializationError | undefined } | undefined>(
        undefined
    );
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
        const state = dCore.getState();
        if (!state.hasResolved) {
            // The interceptor can wait for this exact promise and retry its predicate.
            // Premature reads outside that internal evaluation are application errors.
            if (isEvaluatingInterceptor) {
                throw dCore.pr;
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
        const core = getCore(caller);
        if (!core.isUserLoggedIn) {
            throw new Error(`oidc-spa: ${caller} called/accessed but the user is not logged in.`);
        }
        return core;
    }

    function getUserResult(): UserResult {
        const state = $userResult();
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

    const prInitialized = Promise.all([dCore.pr, dUser.pr]).then(() => true as const);
    const user$ = Object.assign(userSubject.asObservable(), {
        getValue: () => getUserResult().user
    });

    const oidc: OidcService<boolean, User> = {
        prInitialized,
        get initializationError() {
            const coreState = dCore.getState();
            if (coreState.hasResolved && coreState.value instanceof OidcInitializationError) {
                return coreState.value;
            }
            const userState = $userResult();
            if (userState === undefined) {
                throw new Error(
                    "oidc-spa: initializationError accessed before oidc.prInitialized resolved."
                );
            }
            if (userState.value instanceof OidcInitializationError) {
                return userState.value;
            }
            const core = getCore("initializationError");
            return core.isUserLoggedIn ? undefined : core.initializationError;
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
            await dCore.pr;
            const core = getCore("login");
            if (core.isUserLoggedIn) {
                throw new Error(
                    "oidc-spa: login() called while already logged in. Use goToAuthServer() instead."
                );
            }
            return core.login({ ...params, doesCurrentHrefRequiresAuth: false });
        },
        async logout(params) {
            await dCore.pr;
            return getLoggedInCore("logout").logout(params);
        },
        async renewTokens(params) {
            await dCore.pr;
            return getLoggedInCore("renewTokens").renewTokens(params);
        },
        async goToAuthServer(params) {
            await dCore.pr;
            return getLoggedInCore("goToAuthServer").goToAuthServer(params);
        },
        async getAccessToken() {
            await dCore.pr;
            const core = getCore("getAccessToken");
            return core.isUserLoggedIn
                ? { isUserLoggedIn: true, accessToken: (await core.getTokens()).accessToken }
                : { isUserLoggedIn: false };
        },
        accessTokenRotation$: accessTokenRotation.asObservable(),
        $secondsLeftBeforeAutoLogout: secondsLeftBeforeAutoLogout.asReadonly(),
        $user: computed(() => getUserResult().user),
        user$,
        async getUser() {
            await dCore.pr;
            return getLoggedInCore("getUser").getUser();
        },
        async refreshUser() {
            await prInitialized;
            return getUserResult().refreshUser();
        }
    };

    function setUserResult(value: UserResult | OidcInitializationError | undefined) {
        dUser.resolve(value);
        $userResult.set({ value });
        if (value instanceof OidcInitializationError) {
            userSubject.error(value);
        } else if (value === undefined) {
            userSubject.complete();
        } else {
            userSubject.next(value.user);
        }
    }

    async function initialize(initialization: InitializationParams<User>): Promise<true> {
        if (hasStarted) {
            return prInitialized;
        }
        hasStarted = true;

        let core: Core;
        let shouldGetUser: boolean;
        let warnUserSecondsBeforeAutoLogout = 60;

        if (initialization.implementation === "mock") {
            const { createMockOidc } = await import("../core/createMockOidc");
            const params = initialization.params;
            const user_mock = params.user_mock ?? builder.user_mock;
            core = await createMockOidc({
                BASE_URL: getBaseHref(),
                autoLogin: builder.autoLogin,
                isUserInitiallyLoggedIn: builder.autoLogin || (params.isUserInitiallyLoggedIn ?? true),
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
            const { createUser } = builder;
            const paramsOfCreateOidc = {
                ...params,
                BASE_URL: getBaseHref(),
                autoLogin: builder.autoLogin,
                createUser:
                    createUser === undefined
                        ? undefined
                        : (params: Parameters<typeof createUser>[0]) =>
                              runInInjectionContext(injector, () => createUser(params))
            };
            try {
                core = await createOidc(paramsOfCreateOidc);
            } catch (error) {
                // Core throws OidcInitializationError for authentication failure with auto-login.
                // Programming errors and other unexpected failures must propagate unchanged.
                if (!(error instanceof OidcInitializationError)) {
                    throw error;
                }
                dCore.resolve(error);
                setUserResult(error);
                return prInitialized;
            }
            shouldGetUser = createUser !== undefined;
        }

        dCore.resolve(core);
        if (destroyed) {
            setUserResult(undefined);
            return prInitialized;
        }

        if (core.isUserLoggedIn) {
            registerCleanup(
                core.subscribeToTokensChange(({ accessToken }) => {
                    accessTokenRotation.next(accessToken);
                }).unsubscribeFromTokensChange
            );
            registerCleanup(
                core.subscribeToAutoLogoutCountdown(({ secondsLeft }) => {
                    secondsLeftBeforeAutoLogout.set(
                        secondsLeft === undefined || secondsLeft > warnUserSecondsBeforeAutoLogout
                            ? null
                            : secondsLeft
                    );
                }).unsubscribeFromAutoLogoutCountdown
            );
        }

        if (!core.isUserLoggedIn || !shouldGetUser) {
            setUserResult(undefined);
            return prInitialized;
        }

        let result: UserResult;
        try {
            result = await core.getUser();
        } catch (error) {
            // Same initial-createUser error contract as the React adapter.
            setUserResult(
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
            result.subscribeToUserChange(({ user }) => {
                // React keeps this result current too. Angular's signal only notifies its consumers.
                result.user = user;
                $userResult.set({ value: result });
                userSubject.next(user);
            }).unsubscribeFromUserChange
        );
        setUserResult(result);
        return prInitialized;
    }

    return {
        oidc,
        initialize,
        getCore,
        prCore: dCore.pr,
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
