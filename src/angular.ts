import { BehaviorSubject } from "rxjs";
import type { Oidc, OidcInitializationError, ParamsOfCreateOidc } from "./core";
import type { OidcMetadata } from "./core/OidcMetadata";
import { Deferred } from "./tools/Deferred";
import { assert, type Equals, is } from "./vendor/frontend/tsafe";
import { createObjectThatThrowsIfAccessed } from "./tools/createObjectThatThrowsIfAccessed";
import {
    type Signal,
    inject,
    type EnvironmentProviders,
    makeEnvironmentProviders,
    provideAppInitializer
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import type { ReadonlyBehaviorSubject } from "./tools/ReadonlyBehaviorSubject";
import { Router, type CanActivateFn } from "@angular/router";
import type { ValueOrAsyncGetter } from "./tools/ValueOrAsyncGetter";
import { getBaseHref } from "./tools/getBaseHref";

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
};

assert<
    Equals<ParamsOfProvide, Omit<ParamsOfCreateOidc<any, boolean>, "homeUrl" | "decodedIdTokenSchema">>
>;

export type ParamsOfProvideMock = {
    mockIssuerUri?: string;
    mockClientId?: string;
    mockAccessToken?: string;
    isUserInitiallyLoggedIn?: boolean;
};

export class OidcService<
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

    static provide(params: ValueOrAsyncGetter<ParamsOfProvide>): EnvironmentProviders {
        const paramsOrGetParams = params;

        return makeEnvironmentProviders([
            this,
            provideAppInitializer(async () => {
                const instance = inject(this);

                instance.#initialize({
                    prOidcOrInitializationError: (async () => {
                        const [{ createOidc }, params] = await Promise.all([
                            import("./core"),
                            typeof paramsOrGetParams === "function"
                                ? paramsOrGetParams()
                                : paramsOrGetParams
                        ]);

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

    static provideMock(params: ParamsOfProvideMock): EnvironmentProviders {
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

    static enforceLoginGuard() {
        const canActivateFn = (async route => {
            const instance = inject(this);
            const router = inject(Router);

            await instance.prInitialized;

            const oidc = instance.#getOidc({ callerName: "enforceLoginGuard" });

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
            }

            return true;
        }) satisfies CanActivateFn;
        return canActivateFn;
    }

    #dState = new Deferred<{
        oidc: Oidc<T_DecodedIdToken> | undefined;
        initializationError: OidcInitializationError | undefined;
    }>();

    get prInitialized(): Promise<void> {
        return this.#dState.pr.then(() => undefined);
    }

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
            "Await `oidc.prInitialized` before using synchronous members",
            "of oidc."
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

    #getOidc(params: { callerName: string }) {
        const { callerName } = params;
        const state = this.#getState({ callerName });
        if (state.oidc === undefined) {
            // initialization failed
            assert(state.initializationError !== undefined);
            throw new Error(
                [
                    `oidc-spa: ${callerName} was accessed but initialization failed.`,
                    "You are using `autoLogin: true`, so there is no anonymous state.",
                    "Handle this by gating your UI:",
                    "if (oidc.initializationError) show an error/fallback."
                ].join(" ")
            );
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
            await this.prInitialized;

            const oidc = this.#getOidc({ callerName: "decodedIdToken" });

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

    #map_$secondsLeftBeforeAutoLogoutByWarningDurationSeconds = new Map<number, Signal<number | null>>();
    get$secondsLeftBeforeAutoLogout(params: { warningDurationSeconds: number }): Signal<number | null> {
        const { warningDurationSeconds } = params;

        {
            const $secondsLeftBeforeAutoLogout =
                this.#map_$secondsLeftBeforeAutoLogoutByWarningDurationSeconds.get(
                    warningDurationSeconds
                );

            if ($secondsLeftBeforeAutoLogout !== undefined) {
                return $secondsLeftBeforeAutoLogout;
            }
        }

        const oidc = this.#getOidc({ callerName: "get$secondsLeftBeforeAutoLogout" });

        const secondsLeftBeforeAutoLogout$ = new BehaviorSubject<number | null>(null);

        if (oidc.isUserLoggedIn) {
            oidc.subscribeToAutoLogoutCountdown(({ secondsLeft }) => {
                if (secondsLeft === undefined || secondsLeft > warningDurationSeconds) {
                    if (secondsLeftBeforeAutoLogout$.getValue() !== null) {
                        secondsLeftBeforeAutoLogout$.next(null);
                    }
                    return;
                }

                secondsLeftBeforeAutoLogout$.next(secondsLeft);
            });
        }

        const $secondsLeftBeforeAutoLogout = toSignal(secondsLeftBeforeAutoLogout$, {
            requireSync: true
        });

        this.#map_$secondsLeftBeforeAutoLogoutByWarningDurationSeconds.set(
            warningDurationSeconds,
            $secondsLeftBeforeAutoLogout
        );

        return $secondsLeftBeforeAutoLogout;
    }

    get isNewBrowserSession() {
        const oidc = this.#getOidc({ callerName: "isNewBrowserSession" });

        if (!oidc.isUserLoggedIn) {
            throw new Error("oidc-spa: isNewBrowserSession was used but the used is not logged in");
        }

        return oidc.isNewBrowserSession;
    }
}
