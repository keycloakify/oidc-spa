import { BehaviorSubject, from, switchMap, Subject } from "rxjs";
import type { Oidc, OidcInitializationError, ParamsOfCreateOidc } from "./core";
import type { OidcMetadata } from "./core/OidcMetadata";
import { Deferred } from "./tools/Deferred";
import { assert, type Equals, is } from "./tools/tsafe/assert";
import { uncapitalize } from "./tools/tsafe/uncapitalize";
import { createObjectThatThrowsIfAccessed, AccessError } from "./tools/createObjectThatThrowsIfAccessed";
import {
    type Signal,
    inject,
    type EnvironmentProviders,
    makeEnvironmentProviders,
    provideAppInitializer
} from "@angular/core";
import type { HttpInterceptorFn, HttpRequest } from "@angular/common/http";
import { toSignal } from "@angular/core/rxjs-interop";
import type { ReadonlyBehaviorSubject } from "./tools/ReadonlyBehaviorSubject";
import { Router, type CanActivateFn } from "@angular/router";
import type { ValueOrAsyncGetter } from "./tools/ValueOrAsyncGetter";
import { getBaseHref } from "./tools/getBaseHref";
import type { ConcreteClass } from "./tools/ConcreteClass";
import { setDesiredPostLoginRedirectUrl } from "./core/desiredPostLoginRedirectUrl";

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
     * Determines how session restoration is handled.
     * Session restoration allows users to stay logged in between visits
     * without needing to explicitly sign in each time.
     *
     * Options:
     *
     * - **"auto" (default)**:
     *   Automatically selects the best method.
     *   If the app’s domain shares a common parent domain with the authorization endpoint,
     *   an iframe is used for silent session restoration.
     *   Otherwise, a full-page redirect is used.
     *
     * - **"full page redirect"**:
     *   Forces full-page reloads for session restoration.
     *   Use this if your application is served with a restrictive CSP
     *   (e.g., `Content-Security-Policy: frame-ancestors "none"`)
     *   or `X-Frame-Options: DENY`, and you cannot modify those headers.
     *   This mode provides a slightly less seamless UX and will lead oidc-spa to
     *   store tokens in `localStorage` if multiple OIDC clients are used
     *   (e.g., your app communicates with several APIs).
     *
     * - **"iframe"**:
     *   Forces iframe-based session restoration.
     *   In development, if you go in your browser setting and allow your auth server’s domain
     *   to set third-party cookies this value will let you test your app
     *   with the local dev server as it will behave in production.
     */
    sessionRestorationMethod?: "iframe" | "full page redirect" | "auto";

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
        Omit<
            ParamsOfCreateOidc<any, boolean>,
            "homeUrl" | "BASE_URL" | "noIframe" | "decodedIdTokenSchema"
        >
    >
>;

export type ParamsOfProvideMock = {
    mockIssuerUri?: string;
    mockClientId?: string;
    mockAccessToken?: string;
    isUserInitiallyLoggedIn?: boolean;
};

export abstract class AbstractOidcService<
    T_DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_OidcCoreSpec
> {
    protected autoLogin: boolean = false;
    protected providerAwaitsInitialization: boolean = true;
    protected decodedIdTokenSchema:
        | {
              parse: (
                  decodedIdToken_original: Oidc.Tokens.DecodedIdToken_OidcCoreSpec
              ) => T_DecodedIdToken;
          }
        | undefined = undefined;

    protected mockDecodedIdToken: (() => Promise<T_DecodedIdToken>) | T_DecodedIdToken | undefined =
        undefined;

    #autoLogoutWarningDurationSeconds = 45;

    #isRunningGetParams = false;

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
                                    ? (async () => {
                                          instance.#isRunningGetParams = true;
                                          const params = await paramsOrGetParams();
                                          instance.#isRunningGetParams = false;
                                          return params;
                                      })()
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

    protected allowDecodedIdTokenAccessInShouldInjectAccessToken = false;

    #deadlockDetectionTimer: ReturnType<typeof setTimeout> | undefined = undefined;

    static createBearerInterceptor(params: {
        shouldInjectAccessToken: (req: HttpRequest<unknown>) => boolean;
    }): HttpInterceptorFn {
        const { shouldInjectAccessToken: getShouldInjectAccessToken } = params;

        return (req, next) => {
            const instance = inject(this);

            let shouldInjectAccessToken: boolean | undefined = undefined;
            const shouldInjectAccessTokenByState: {
                isUserLoggedIn: boolean;
                isNewBrowserSession: boolean | undefined;
                shouldInjectAccessTokenOrError: boolean | { error: unknown };
            }[] = [];

            let isDecodedIdTokenAccessed = false;

            (instance.decodedIdTokenAccess = new Subject()).subscribe(
                () => (isDecodedIdTokenAccessed = true)
            );

            try {
                shouldInjectAccessToken = getShouldInjectAccessToken(req);
            } catch (error) {
                if (!(error instanceof OidcAccessedTooEarlyError) && !(error instanceof AccessError)) {
                    throw error;
                }
            }

            if (shouldInjectAccessToken === undefined) {
                for (const isUserLoggedIn of [false, true]) {
                    for (const isNewBrowserSession of isUserLoggedIn ? [false, true] : [undefined]) {
                        let shouldInjectAccessTokenOrError: boolean | { error: unknown };

                        instance.#isUserLoggedIn_override = isUserLoggedIn;
                        instance.#isNewBrowserSession_override = isNewBrowserSession;

                        try {
                            shouldInjectAccessTokenOrError = getShouldInjectAccessToken(req);
                        } catch (error) {
                            shouldInjectAccessTokenOrError = { error };
                        }

                        instance.#isUserLoggedIn_override = undefined;
                        instance.#isNewBrowserSession_override = undefined;

                        shouldInjectAccessTokenByState.push({
                            isUserLoggedIn,
                            isNewBrowserSession,
                            shouldInjectAccessTokenOrError
                        });
                    }
                }
            }

            instance.decodedIdTokenAccess = undefined;

            if (
                !instance.providerAwaitsInitialization &&
                isDecodedIdTokenAccessed &&
                !instance.allowDecodedIdTokenAccessInShouldInjectAccessToken
            ) {
                throw new Error(
                    "oidc-spa: See https://docs.oidc-spa.dev/release-notes/reading-decodedaccesstoken-within-shouldinjectaccesstoken"
                );
            }

            if (
                shouldInjectAccessToken === false ||
                (shouldInjectAccessToken === undefined &&
                    shouldInjectAccessTokenByState.every(
                        ({ shouldInjectAccessTokenOrError }) => shouldInjectAccessTokenOrError === false
                    ))
            ) {
                return next(req);
            }

            if (instance.#isRunningGetParams && instance.#deadlockDetectionTimer === undefined) {
                instance.#deadlockDetectionTimer = setTimeout(() => {
                    const name = this.name.replace(/^_/, "");

                    switch (shouldInjectAccessToken) {
                        case false:
                            assert(false);
                        case true:
                            console.warn(
                                [
                                    "oidc-spa: Probable deadlock detected!",
                                    `Request ${req.method} ${req.urlWithParams} requires an access token,`,
                                    `but this request is probably being made inside the async callback of`,
                                    `${name}.provide(async () => {...}).`,
                                    "At this point the access token cannot exist yet, initialization depends on this request itself."
                                ].join(" ")
                            );
                            break;
                        case undefined:
                            console.warn(
                                [
                                    "oidc-spa: Probable deadlock detected!",
                                    `While evaluating shouldInjectAccessToken(req) for ${req.method} ${req.urlWithParams},`,
                                    "you accessed synchronous properties of",
                                    `\`${uncapitalize(name)} = inject(${name})\` that`,
                                    "are only available after initialization completes.",
                                    `Requests made inside the ${name}.provide(async () => {...}) callback`,
                                    `(typically to fetch the params), should not trigger a read of `,
                                    `${uncapitalize(
                                        name
                                    )}.isUserLoggedIn or other properties inside shouldInjectAccessToken()`,
                                    "This creates a causality violation.",
                                    "Reorganize your shouldInjectAccessToken implementation to exit early with `false` in those case,",
                                    "before accessing the property."
                                ].join(" ")
                            );
                            break;
                    }
                }, 4_000);
            }

            return from(instance.getAccessToken()).pipe(
                switchMap(({ accessToken }) => {
                    if (instance.#deadlockDetectionTimer !== undefined) {
                        clearTimeout(instance.#deadlockDetectionTimer);
                        instance.#deadlockDetectionTimer = undefined;
                    }

                    if (shouldInjectAccessToken === undefined) {
                        const match = shouldInjectAccessTokenByState.find(
                            ({ isUserLoggedIn, isNewBrowserSession }) =>
                                isUserLoggedIn === instance.isUserLoggedIn &&
                                isNewBrowserSession ===
                                    (instance.isUserLoggedIn ? instance.isNewBrowserSession : undefined)
                        );

                        assert(match !== undefined);

                        const { shouldInjectAccessTokenOrError } = match;

                        if (typeof shouldInjectAccessTokenOrError !== "boolean") {
                            const { error } = shouldInjectAccessTokenOrError;
                            throw error;
                        }

                        shouldInjectAccessToken = shouldInjectAccessTokenOrError;
                    }

                    if (!shouldInjectAccessToken) {
                        return next(req);
                    }

                    if (!instance.isUserLoggedIn) {
                        throw new OidcAccessedTooEarlyError(
                            [
                                `oidc-spa: attempted to inject an Authorization bearer token`,
                                `for ${req.method} ${req.urlWithParams} but the user is not logged in.`,
                                `You shouldn't be attempting to call API endpoint that require authentication`,
                                `when the user isn't logged in.`
                            ].join(" ")
                        );
                    }

                    assert(accessToken !== undefined);

                    return next(req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } }));
                })
            );
        };
    }

    static get enforceLoginGuard() {
        const canActivateFn = (async route => {
            const instance = inject(this);
            const router = inject(Router);

            await instance.prInitialized;

            const redirectUrl = router.serializeUrl(
                router.createUrlTree(
                    route.url.map(u => u.path),
                    {
                        queryParams: route.queryParams,
                        fragment: route.fragment ?? undefined
                    }
                )
            );

            const oidc = instance.#getOidc({ callerName: "enforceLoginGuard" });

            const isUrlAlreadyReplaced =
                window.location.href.replace(/\/$/, "") === redirectUrl.replace(/\/$/, "");

            if (!oidc.isUserLoggedIn) {
                await oidc.login({
                    doesCurrentHrefRequiresAuth: isUrlAlreadyReplaced,
                    redirectUrl
                });
            }

            define_temporary_postLoginRedirectUrl: {
                if (isUrlAlreadyReplaced) {
                    break define_temporary_postLoginRedirectUrl;
                }

                setDesiredPostLoginRedirectUrl({ postLoginRedirectUrl: redirectUrl });

                const history_pushState = history.pushState;
                const history_replaceState = history.replaceState;

                const onNavigated = () => {
                    history.pushState = history_pushState;
                    history.replaceState = history_replaceState;
                    setDesiredPostLoginRedirectUrl({ postLoginRedirectUrl: undefined });
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

            return true;
        }) satisfies CanActivateFn;
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
            throw new OidcAccessedTooEarlyError(
                this.#getPrInitializedNotResolvedErrorMessage({ callerName })
            );
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

    get validRedirectUri() {
        return this.#getOidc({ callerName: "validRedirectUri" }).params.validRedirectUri;
    }

    #isUserLoggedIn_override: boolean | undefined = undefined;

    get isUserLoggedIn() {
        return (
            this.#isUserLoggedIn_override ??
            this.#getOidc({ callerName: "isUserLoggedIn" }).isUserLoggedIn
        );
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

    decodedIdTokenAccess: Subject<void> | undefined = undefined;

    get decodedIdToken$(): ReadonlyBehaviorSubject<T_DecodedIdToken> {
        this.decodedIdTokenAccess?.next();
        return this.#decodedIdToken$;
    }

    readonly #decodedIdToken$: ReadonlyBehaviorSubject<T_DecodedIdToken> = (() => {
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

    readonly #$decodedIdToken = toSignal(this.decodedIdToken$, { requireSync: true });

    get $decodedIdToken(): Signal<T_DecodedIdToken> {
        this.decodedIdTokenAccess?.next();
        return this.#$decodedIdToken;
    }

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

    #isNewBrowserSession_override: boolean | undefined = undefined;

    get isNewBrowserSession() {
        if (this.#isNewBrowserSession_override !== undefined) {
            return this.#isNewBrowserSession_override;
        }

        const oidc = this.#getOidc({ callerName: "isNewBrowserSession" });

        if (!oidc.isUserLoggedIn) {
            throw new Error("oidc-spa: isNewBrowserSession was used but the used is not logged in");
        }

        return oidc.isNewBrowserSession;
    }
}

export class OidcAccessedTooEarlyError extends Error {
    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
