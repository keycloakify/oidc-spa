import { BehaviorSubject } from "rxjs";
import type { Oidc, OidcInitializationError, ParamsOfCreateOidc } from "./core";
import type { OidcMetadata } from "./core/OidcMetadata";
import { Deferred } from "./tools/Deferred";
import { assert, type Equals, is } from "./tools/tsafe/assert";
import { createObjectThatThrowsIfAccessed } from "./tools/createObjectThatThrowsIfAccessed";
import { HttpHandlerFn, HttpInterceptorFn, HttpRequest } from "@angular/common/http";
import {
    inject,
    makeEnvironmentProviders,
    provideAppInitializer,
    type EnvironmentProviders,
    type Signal
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import {
    ActivatedRouteSnapshot,
    GuardResult,
    Router,
    RouterStateSnapshot,
    type CanActivateFn
} from "@angular/router";
import { BehaviorSubject, from, mergeMap, switchMap } from "rxjs";
import type { Oidc, OidcInitializationError, ParamsOfCreateOidc } from "./core";
import type { OidcMetadata } from "./core/OidcMetadata";
import type { ConcreteClass } from "./tools/ConcreteClass";
import { Deferred } from "./tools/Deferred";
import type { ReadonlyBehaviorSubject } from "./tools/ReadonlyBehaviorSubject";
import type { ValueOrAsyncGetter } from "./tools/ValueOrAsyncGetter";
import { createObjectThatThrowsIfAccessed } from "./tools/createObjectThatThrowsIfAccessed";
import { getBaseHref } from "./tools/getBaseHref";
import { assert, is, type Equals } from "./vendor/frontend/tsafe";

export type ParamsOfProvide = {
    issuerUri: string;
    clientId: string;
    /**
     * The scopes being requested from the OIDC/OAuth2 provider (default: `["profile"]`
     * (the scope "openid" is added automatically as it's mandatory)
     **/
    scopes?: string[];

    /**
     * Transform the url (authorization endpoint) before redirecting to the login pages.
     *
     * The isSilent parameter is true when the redirect is initiated in the background iframe for silent signin.
     * This can be used to omit ui related query parameters (like `ui_locales`).
     */
    transformUrlBeforeRedirect?: (params: { authorizationUrl: string; isSilent: boolean }) => string;

    /**
     * Extra query params to be added to the authorization endpoint url before redirecting or silent signing in.
     * You can provide a function that returns those extra query params, it will be called
     * when login() is called.
     *
     * Example: extraQueryParams: ()=> ({ ui_locales: "fr" })
     *
     * This parameter can also be passed to login() directly.
     */
    extraQueryParams?:
        | Record<string, string | undefined>
        | ((params: { isSilent: boolean; url: string }) => Record<string, string | undefined>);
    /**
     * Extra body params to be added to the /token POST request.
     *
     * It will be used when for the initial request, whenever the token is getting refreshed and if you call `renewTokens()`.
     * You can also provide this parameter directly to the `renewTokens()` method.
     *
     * It can be either a string to string record or a function that returns a string to string record.
     *
     * Example: extraTokenParams: ()=> ({ selectedCustomer: "xxx" })
     *          extraTokenParams: { selectedCustomer: "xxx" }
     */
    extraTokenParams?: Record<string, string | undefined> | (() => Record<string, string | undefined>);
    /**
     * Usage discouraged, it's here because we don't want to assume too much on your
     * usecase but I can't think of a scenario where you would want anything
     * other than the current page.
     *
     * Where to redirect after successful login.
     * Default: window.location.href (here)
     *
     * It does not need to include the origin, eg: "/dashboard"
     *
     * This parameter can also be passed to login() directly as `redirectUrl`.
     */
    postLoginRedirectUrl?: string;

    /**
     * This parameter defines after how many seconds of inactivity the user should be
     * logged out automatically.
     *
     * WARNING: It should be configured on the identity server side
     * as it's the authoritative source for security policies and not the client.
     * If you don't provide this parameter it will be inferred from the refresh token expiration time.
     * */
    idleSessionLifetimeInSeconds?: number;

    /**
     * Usage discouraged, this parameter exists because we don't want to assume
     * too much about your usecase but I can't think of a scenario where you would
     * want anything other than the current page.
     *
     * Default: { redirectTo: "current page" }
     */
    autoLogoutParams?: Parameters<Oidc.LoggedIn<any>["logout"]>[0];
    autoLogin?: boolean;

    /**
     * Default: false
     *
     * See: https://docs.oidc-spa.dev/v/v8/resources/iframe-related-issues
     */
    noIframe?: boolean;

    debugLogs?: boolean;

    /**
     * WARNING: This option exists solely as a workaround
     * for limitations in the Google OAuth API.
     * See: https://docs.oidc-spa.dev/providers-configuration/google-oauth
     *
     * Do not use this for other providers.
     * If you think you need a client secret in a SPA, you are likely
     * trying to use a confidential (private) client in the browser,
     * which is insecure and not supported.
     */
    __unsafe_clientSecret?: string;

    /**
     *  WARNING: Setting this to true is a workaround for provider
     *  like Google OAuth that don't support JWT access token.
     *  Use at your own risk, this is a hack.
     */
    __unsafe_useIdTokenAsAccessToken?: boolean;

    /**
     * This option should only be used as a last resort.
     *
     * If your OIDC provider is correctly configured, this should not be necessary.
     *
     * The metadata is normally retrieved automatically from:
     * `${issuerUri}/.well-known/openid-configuration`
     *
     * Use this only if that endpoint is not accessible (e.g. due to missing CORS headers
     * or non-standard deployments), and you cannot fix the server-side configuration.
     */
    __metadata?: Partial<OidcMetadata>;

    /**
     * You can use oidc.$secondsLeftBeforeAutoLogout to display an overlay/update the tab title
     * to indicate to your user that they are going to be logged out if they don't interact
     * with the app.
     * This value let you define how long before how long before auto logout this warning should
     * start showing.
     * Default is 45 seconds.
     */
    autoLogoutWarningDurationSeconds?: number;
};

assert<
    Equals<
        Omit<ParamsOfProvide, "autoLogoutWarningDurationSeconds">,
        Omit<ParamsOfCreateOidc<any, boolean>, "homeUrl" | "decodedIdTokenSchema">
    >
>;

export type ParamsOfProvideMock = {
    mockIssuerUri?: string;
    mockClientId?: string;
    mockAccessToken?: string;
    isUserInitiallyLoggedIn?: boolean;
};

type BearerTokenCondition<
    T_DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base
> = {
    /**
     * A function that dynamically determines whether the Bearer token should be included
     * in the `Authorization` header for a given request.
     *
     * This function is asynchronous and receives the following arguments:
     * - `req`: The `HttpRequest` object representing the current outgoing HTTP request.
     * - `next`: The `HttpHandlerFn` for forwarding the request to the next handler in the chain.
     * - `oidc`: The `Oidc` instance representing the authentication context.
     */
    shouldAddToken: (
        req: HttpRequest<unknown>,
        next: HttpHandlerFn,
        oidc: Oidc<T_DecodedIdToken>
    ) => Promise<boolean>;
};

export abstract class AbstractOidcService<
    T_DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base
> {
    protected autoLogin: boolean = false;
    protected providerAwaitsInitialization: boolean = true;
    protected decodedIdTokenSchema:
        | {
              parse: (decodedIdToken_original: Oidc.Tokens.DecodedIdToken_base) => T_DecodedIdToken;
          }
        | undefined = undefined;

    protected mockDecodedIdToken: (() => Promise<T_DecodedIdToken>) | T_DecodedIdToken | undefined =
        undefined;

    #autoLogoutWarningDurationSeconds = 45;

    static provide(params: ValueOrAsyncGetter<ParamsOfProvide>): EnvironmentProviders {
        const paramsOrGetParams = params;

        assert(is<ConcreteClass<typeof AbstractOidcService>>(this));

        return makeEnvironmentProviders([
            this,
            provideAppInitializer(async () => {
                const instance = inject(this);

                instance.#initialize({
                    prOidcOrInitializationError: (async () => {
                        const [{ createOidc }, { autoLogoutWarningDurationSeconds, ...params }] =
                            await Promise.all([
                                import("./core"),
                                typeof paramsOrGetParams === "function"
                                    ? paramsOrGetParams()
                                    : paramsOrGetParams
                            ]);

                        if (autoLogoutWarningDurationSeconds !== undefined) {
                            instance.#autoLogoutWarningDurationSeconds =
                                autoLogoutWarningDurationSeconds;
                        }

                        try {
                            return createOidc({
                                homeUrl: getBaseHref(),
                                autoLogin: instance.autoLogin,
                                decodedIdTokenSchema: instance.decodedIdTokenSchema,
                                ...params
                            });
                        } catch (initializationError) {
                            assert(initializationError instanceof Error);
                            assert(is<OidcInitializationError>(initializationError));
                            return initializationError;
                        }
                    })()
                });

                if (instance.providerAwaitsInitialization) {
                    await instance.prInitialized;
                }
            })
        ]);
    }

    static provideMock(params: ParamsOfProvideMock = {}): EnvironmentProviders {
        assert(is<ConcreteClass<typeof AbstractOidcService>>(this));

        return makeEnvironmentProviders([
            this,
            provideAppInitializer(async () => {
                const instance = inject(this);

                instance.#initialize({
                    prOidcOrInitializationError: (async () => {
                        const { createMockOidc } = await import("./mock");

                        return createMockOidc<Record<string, unknown>, boolean>({
                            homeUrl: getBaseHref(),
                            autoLogin: instance.autoLogin,
                            isUserInitiallyLoggedIn: instance.autoLogin
                                ? true
                                : params.isUserInitiallyLoggedIn,
                            mockedParams: {
                                issuerUri: params.mockIssuerUri,
                                clientId: params.mockClientId
                            },
                            mockedTokens: {
                                accessToken: params.mockAccessToken,
                                decodedIdToken: await (() => {
                                    if (instance.mockDecodedIdToken === undefined) {
                                        return undefined;
                                    }
                                    if (typeof instance.mockDecodedIdToken === "function") {
                                        return instance.mockDecodedIdToken();
                                    }
                                })()
                            }
                        });
                    })()
                });

                await instance.prInitialized;
            })
        ]);
    }

    #createBearerTokenInterceptor<
        T_DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base
    >({
        bearerPrefix,
        authorizationHeaderName,
        conditions,
        req,
        next
    }: {
        bearerPrefix?: string;
        authorizationHeaderName?: string;
        conditions: BearerTokenCondition<T_DecodedIdToken>[];
        req: HttpRequest<unknown>;
        next: HttpHandlerFn;
    }): ReturnType<HttpInterceptorFn> {
        return from(this.prInitialized).pipe(
            switchMap(() => {
                const oidc: Oidc<T_DecodedIdToken> = this.#getOidc({
                    callerName: "createBearerTokenInterceptor"
                }) as Oidc<T_DecodedIdToken>;
                return from(
                    Promise.all(
                        conditions.map(
                            async condition => await condition.shouldAddToken(req, next, oidc)
                        )
                    )
                );
            }),
            mergeMap(evaluatedConditions => {
                const matchingConditionIndex = evaluatedConditions.findIndex(Boolean);
                const matchingCondition = conditions[matchingConditionIndex];

                if (!matchingCondition) {
                    return next(req);
                }
                return from(this.getAccessToken()).pipe(
                    switchMap(({ isUserLoggedIn, accessToken }) => {
                        if (!isUserLoggedIn) {
                            throw new Error(
                                `Assertion Error: Call to ${req.url} while the user isn't logged in.`
                            );
                        }
                        const clonedRequest = req.clone({
                            setHeaders: {
                                [authorizationHeaderName ?? "Authorization"]: `${
                                    bearerPrefix ?? "Bearer"
                                } ${accessToken}`
                            }
                        });
                        return next(clonedRequest);
                    })
                );
            })
        );
    }

    static createAdvancedBearerTokenInterceptor<
        T_DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base
    >({
        bearerPrefix,
        authorizationHeaderName,
        conditions
    }: {
        bearerPrefix?: string;
        authorizationHeaderName?: string;
        conditions?: BearerTokenCondition<T_DecodedIdToken>[];
    }): HttpInterceptorFn {
        const bearerConditions = conditions ?? [];
        const interceptor: HttpInterceptorFn = (req, next) => {
            const instance = inject(this);

            return instance.#createBearerTokenInterceptor({
                conditions: bearerConditions,
                bearerPrefix,
                next,
                req,
                authorizationHeaderName
            });
        };
        return interceptor;
    }

    static createBasicBearerTokenInterceptor({
        bearerPrefix,
        authorizationHeaderName,
        conditions
    }: {
        bearerPrefix?: string;
        authorizationHeaderName?: string;
        conditions: {
            urlPattern: RegExp;
            httpMethods?: ("GET" | "POST" | "PUT" | "DELETE" | "OPTIONS" | "HEAD" | "PATCH")[];
        }[];
    }) {
        const findMatchingCondition = (
            { method, url }: HttpRequest<unknown>,
            {
                urlPattern,
                httpMethods = []
            }: {
                urlPattern: RegExp;
                httpMethods?: ("GET" | "POST" | "PUT" | "DELETE" | "OPTIONS" | "HEAD" | "PATCH")[];
            }
        ): boolean => {
            const httpMethodTest =
                httpMethods.length === 0 || httpMethods.join().indexOf(method.toUpperCase()) > -1;

            const urlTest = urlPattern.test(url);

            return httpMethodTest && urlTest;
        };
        const interceptor: HttpInterceptorFn = (req, next) => {
            const instance = inject(this);
            return instance.#createBearerTokenInterceptor({
                bearerPrefix,
                authorizationHeaderName,
                conditions: conditions.map<BearerTokenCondition>(c => ({
                    shouldAddToken: async req => findMatchingCondition(req, c)
                })),
                req,
                next
            });
        };

        return interceptor;
    }

    static get bearerTokenInterceptor() {
        const interceptor: HttpInterceptorFn = (req, next) => {
            const instance = inject(this);
            return instance.#createBearerTokenInterceptor({
                conditions: [{ shouldAddToken: async () => true }],
                req,
                next
            });
        };
        return interceptor;
    }

    async #createAuthGuard<
        T_DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base
    >(
        isAccessAllowed: ({
            route,
            state,
            oidc
        }: {
            route: ActivatedRouteSnapshot;
            state: RouterStateSnapshot;
            oidc: Oidc<T_DecodedIdToken>;
        }) => Promise<GuardResult> | GuardResult,
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot
    ) {
        await this.prInitialized;

        const oidc: Oidc<T_DecodedIdToken> = this.#getOidc({
            callerName: "createAuthGuard"
        }) as Oidc<T_DecodedIdToken>;

        return isAccessAllowed({ route, state, oidc });
    }

    static createAuthGuard<
        T_DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base
    >(
        isAccessAllowed: ({
            route,
            state,
            oidc
        }: {
            route: ActivatedRouteSnapshot;
            state: RouterStateSnapshot;
            oidc: Oidc<T_DecodedIdToken>;
        }) => Promise<GuardResult> | GuardResult
    ): CanActivateFn {
        const canActivateFn: CanActivateFn = (route, state) => {
            const instance = inject(this);
            return instance.#createAuthGuard(isAccessAllowed, route, state);
        };
        return canActivateFn;
    }

    static get enforceLoginGuard(): CanActivateFn {
        const canActivateFn: CanActivateFn = (route, state) => {
            const router = inject(Router);
            const instance = inject(this);
            return instance.#createAuthGuard(
                async ({ route, oidc }) => {
                    if (!oidc.isUserLoggedIn) {
                        const redirectUrl = router.serializeUrl(
                            router.createUrlTree(
                                route.url.map(u => u.path),
                                {
                                    queryParams: route.queryParams,
                                    fragment: route.fragment ?? undefined
                                }
                            )
                        );

                        const doesCurrentHrefRequiresAuth =
                            location.href.replace(/\/$/, "") === redirectUrl.replace(/\/$/, "");

                        await oidc.login({
                            doesCurrentHrefRequiresAuth,
                            redirectUrl
                        });
                        return false;
                    }

                    return true;
                },
                route,
                state
            );
        };
        return canActivateFn;
    }

    #dState = new Deferred<{
        oidc: Oidc<T_DecodedIdToken> | undefined;
        initializationError: OidcInitializationError | undefined;
    }>();

    readonly prInitialized: Promise<true> = this.#dState.pr.then(() => true);

    #initialize(params: {
        prOidcOrInitializationError: Promise<Oidc<T_DecodedIdToken> | OidcInitializationError>;
    }): void {
        const { prOidcOrInitializationError } = params;

        prOidcOrInitializationError.then(oidcOrInitializationError => {
            let initializationError: OidcInitializationError | undefined = undefined;
            let oidc: Oidc<T_DecodedIdToken> | undefined = undefined;

            if (oidcOrInitializationError instanceof Error) {
                initializationError = oidcOrInitializationError;
            } else {
                oidc = oidcOrInitializationError;
                initializationError = oidc.isUserLoggedIn ? undefined : oidc.initializationError;
            }

            this.#dState.resolve({
                oidc,
                initializationError
            });
        });
    }

    #getPrInitializedNotResolvedErrorMessage(params: { callerName: string }) {
        const { callerName } = params;
        return [
            `oidc-spa: ${callerName} called/accessed before`,
            "`oidc.prInitialized` resolved.",
            "You are using `awaitInitialization: false`.",
            "In your template you should wrap your usage of",
            "oidc.isUserLoggedIn, oidc.$decodedIdToken() ect. into",
            "@defer (when oidc.prInitialized | async) { } @placeholder { Loading... }"
        ].join(" ");
    }

    #getState(params: { callerName: string }) {
        const { callerName } = params;
        const { hasResolved, value } = this.#dState.getState();
        if (!hasResolved) {
            throw new Error(this.#getPrInitializedNotResolvedErrorMessage({ callerName }));
        }
        return value;
    }

    get initializationError(): OidcInitializationError | undefined {
        const state = this.#getState({ callerName: "initializationError" });
        return state.initializationError;
    }

    #getAutoLoginAndInitializationErrorAccessErrorMessage(params: { callerName: string }) {
        const { callerName } = params;

        return [
            `oidc-spa: ${callerName} was accessed but initialization failed.`,
            "You are using `autoLogin: true`, so there is no anonymous state.",
            "Handle this by gating your UI:",
            "if (oidc.initializationError) show an error/fallback."
        ].join(" ");
    }

    #getOidc(params: { callerName: string }) {
        const { callerName } = params;
        const state = this.#getState({ callerName });
        if (state.oidc === undefined) {
            // initialization failed
            assert(state.initializationError !== undefined);
            throw new Error(this.#getAutoLoginAndInitializationErrorAccessErrorMessage({ callerName }));
        }
        return state.oidc;
    }

    get issuerUri() {
        return this.#getOidc({ callerName: "issuerUri" }).params.issuerUri;
    }

    get clientId() {
        return this.#getOidc({ callerName: "clientId" }).params.clientId;
    }

    get isUserLoggedIn() {
        return this.#getOidc({ callerName: "isUserLoggedIn" }).isUserLoggedIn;
    }

    async login(params?: {
        /**
         * Add extra query parameters to the url before redirecting to the login pages.
         */
        extraQueryParams?: Record<string, string | undefined>;
        /**
         * Where to redirect after successful login.
         * Default: window.location.href (here)
         *
         * It does not need to include the origin, eg: "/dashboard"
         */
        redirectUrl?: string;

        /**
         * Transform the url before redirecting to the login pages.
         * Prefer using the extraQueryParams parameter if you're only adding query parameters.
         */
        transformUrlBeforeRedirect?: (url: string) => string;
    }): Promise<never> {
        await this.prInitialized;

        const oidc = this.#getOidc({ callerName: "login" });

        if (oidc.isUserLoggedIn) {
            throw new Error(
                [
                    "oidc-spa: login() called but the user is already logged in.",
                    "If you wish to send the user to the login page for some update",
                    "use oidc.goToAuthServer() instead"
                ].join(" ")
            );
        }

        return oidc.login({
            ...params,
            doesCurrentHrefRequiresAuth: false
        });
    }

    async renewTokens(params?: {
        extraTokenParams?: Record<string, string | undefined>;
    }): Promise<void> {
        await this.prInitialized;

        const oidc = this.#getOidc({ callerName: "renewTokens" });

        if (!oidc.isUserLoggedIn) {
            throw new Error("oidc-spa: renewTokens() called but the user is not logged in.");
        }

        return oidc.renewTokens(params);
    }

    async logout(
        params: { redirectTo: "home" | "current page" } | { redirectTo: "specific url"; url: string }
    ): Promise<never> {
        await this.prInitialized;

        const oidc = this.#getOidc({ callerName: "logout" });

        if (!oidc.isUserLoggedIn) {
            throw new Error("oidc-spa: logout() called but the user is not logged in.");
        }

        return oidc.logout(params);
    }

    async goToAuthServer(params: {
        extraQueryParams?: Record<string, string | undefined>;
        redirectUrl?: string;
        transformUrlBeforeRedirect?: (url: string) => string;
    }): Promise<never> {
        await this.prInitialized;

        const oidc = this.#getOidc({ callerName: "goToAuthServer" });

        if (!oidc.isUserLoggedIn) {
            throw new Error("oidc-spa: goToAuthServer() called but the user is not logged in.");
        }

        return oidc.goToAuthServer(params);
    }

    readonly decodedIdToken$: ReadonlyBehaviorSubject<T_DecodedIdToken> = (() => {
        const decodedIdToken$ = new BehaviorSubject<T_DecodedIdToken>(
            createObjectThatThrowsIfAccessed({
                debugMessage: this.#getPrInitializedNotResolvedErrorMessage({
                    callerName: "decodedIdToken"
                })
            })
        );

        (async () => {
            const { initializationError, oidc } = await this.#dState.pr;

            if (initializationError !== undefined) {
                decodedIdToken$.next(
                    createObjectThatThrowsIfAccessed({
                        debugMessage: this.#getAutoLoginAndInitializationErrorAccessErrorMessage({
                            callerName: "decodedIdToken"
                        })
                    })
                );
                return;
            }

            assert(oidc !== undefined);

            if (!oidc.isUserLoggedIn) {
                decodedIdToken$.next(
                    createObjectThatThrowsIfAccessed({
                        debugMessage: [
                            `oidc-spa: Trying to read properties of decodedIdToken, the user`,
                            `isn't currently logged in, this does not make sense.`,
                            `You are responsible for controlling the flow of your app and`,
                            `not try to read the decodedIdToken when oidc.isUserLoggedIn is false.`
                        ].join(" ")
                    })
                );
                return;
            }

            decodedIdToken$.next(oidc.getDecodedIdToken());

            oidc.subscribeToTokensChange(() => {
                const value_new = oidc.getDecodedIdToken();
                const value_current = decodedIdToken$.getValue();

                if (value_new === value_current) {
                    return;
                }

                decodedIdToken$.next(value_new);
            });
        })();

        return decodedIdToken$;
    })();

    readonly $decodedIdToken = toSignal(this.decodedIdToken$, { requireSync: true });

    async getAccessToken(): Promise<
        { isUserLoggedIn: false; accessToken?: never } | { isUserLoggedIn: true; accessToken: string }
    > {
        await this.prInitialized;

        const oidc = this.#getOidc({ callerName: "getAccessToken" });

        return oidc.isUserLoggedIn
            ? { isUserLoggedIn: true, accessToken: (await oidc.getTokens()).accessToken }
            : {
                  isUserLoggedIn: false
              };
    }

    readonly $secondsLeftBeforeAutoLogout: Signal<number | null> = (() => {
        const secondsLeftBeforeAutoLogout$ = new BehaviorSubject<number | null>(null);

        (async () => {
            const { oidc } = await this.#dState.pr;

            if (oidc === undefined) {
                return;
            }

            if (!oidc.isUserLoggedIn) {
                return;
            }

            oidc.subscribeToAutoLogoutCountdown(({ secondsLeft }) => {
                if (secondsLeft === undefined || secondsLeft > this.#autoLogoutWarningDurationSeconds) {
                    if (secondsLeftBeforeAutoLogout$.getValue() !== null) {
                        secondsLeftBeforeAutoLogout$.next(null);
                    }
                    return;
                }
                secondsLeftBeforeAutoLogout$.next(secondsLeft);
            });
        })();

        return toSignal(secondsLeftBeforeAutoLogout$, { requireSync: true });
    })();

    get isNewBrowserSession() {
        const oidc = this.#getOidc({ callerName: "isNewBrowserSession" });

        if (!oidc.isUserLoggedIn) {
            throw new Error("oidc-spa: isNewBrowserSession was used but the used is not logged in");
        }

        return oidc.isNewBrowserSession;
    }
}
