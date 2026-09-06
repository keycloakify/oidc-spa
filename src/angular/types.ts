import type { Signal, AbstractType, EnvironmentProviders } from "@angular/core";
import type { HttpInterceptorFn, HttpRequest } from "@angular/common/http";
import type { CanActivateFn } from "@angular/router";
import type { Observable } from "rxjs";
import type { Oidc, OidcInitializationError, ParamsOfCreateOidc } from "../core";
import type { OidcMetadata } from "../core/OidcMetadata";
import { assert, type Equals } from "../tools/tsafe/assert";
import type { ReadonlyBehaviorSubject } from "../tools/ReadonlyBehaviorSubject";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";

/** Runs in Angular's injection context. Call inject() before the first await. */
export type CreateUser<User> = import("../core").CreateUser<User>;

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

    /**
     * NOTE: Can be provided as parameter to oidcEarlyInit()
     *
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
     * Default is 60 seconds.
     */
    warnUserSecondsBeforeAutoLogout?: number;

    /**
     * This is only for opting out of DPoP for a specific OIDC client instance.
     * To enable DPoP see: https://docs.oidc-spa.dev/v/v10/security-features/dpop
     * */
    disableDPoP?: true;
};

assert<
    Equals<
        Omit<ParamsOfProvide, "warnUserSecondsBeforeAutoLogout">,
        Omit<
            ParamsOfCreateOidc<any, boolean>,
            "homeUrl" | "BASE_URL" | "noIframe" | "decodedIdTokenSchema" | "createUser" | "autoLogin"
        >
    >
>;

export type ParamsOfProvideMock<AutoLogin extends boolean = false, User = never> = {
    mockIssuerUri?: string;
    mockClientId?: string;
    mockAccessToken?: string;
    user_mock?: User;
    isUserInitiallyLoggedIn?: AutoLogin extends true ? true : boolean;
};

/** The object returned by inject(Oidc). User reads require successful initialization and login. */
export type OidcService<AutoLogin extends boolean = false, User = never> = {
    /** Settles after core authentication and the initial user build, including on initialization failure. */
    readonly prInitialized: Promise<true>;
    readonly initializationError: OidcInitializationError | undefined;
    readonly issuerUri: string;
    readonly clientId: string;
    readonly validRedirectUri: string;
    /** Available once core authentication completes, even while createUser is running. */
    readonly isUserLoggedIn: AutoLogin extends true ? true : boolean;
    readonly isNewBrowserSession: boolean;
    readonly backFromAuthServer: Oidc.LoggedIn["backFromAuthServer"];
    login: (
        params?: Omit<
            NonNullable<Parameters<Oidc.NotLoggedIn["login"]>[0]>,
            "doesCurrentHrefRequiresAuth"
        >
    ) => Promise<never>;
    logout: Oidc.LoggedIn["logout"];
    renewTokens: Oidc.LoggedIn["renewTokens"];
    goToAuthServer: Oidc.LoggedIn["goToAuthServer"];
    /** Waits only for core authentication, so it can be used by createUser's HTTP requests. */
    getAccessToken: () => Promise<
        | { isUserLoggedIn: true; accessToken: string }
        | (AutoLogin extends true ? never : { isUserLoggedIn: false; accessToken?: never })
    >;
    readonly accessTokenRotation$: Observable<string>;
    readonly $secondsLeftBeforeAutoLogout: Signal<number | null>;
    readonly $user: Signal<User>;
    /** Replays the current user; subscriptions made during initialization wait for the first user. */
    readonly user$: ReadonlyBehaviorSubject<User>;
    getUser: Oidc.LoggedIn<Oidc.Tokens.DecodedIdToken_OidcCoreSpec, User>["getUser"];
    refreshUser: () => Promise<User>;
};

export type OidcSpaUtils<AutoLogin extends boolean = false, User = never> = {
    Oidc: AbstractType<OidcService<AutoLogin, User>> & OidcHelpers<AutoLogin, User>;
};

export type OidcHelpers<AutoLogin extends boolean, User> = {
    provide: (params: ValueOrAsyncGetter<ParamsOfProvide>) => EnvironmentProviders;
    provideMock: (params?: ParamsOfProvideMock<AutoLogin, User>) => EnvironmentProviders;
    createBearerInterceptor: (params: {
        /**
         * May inject services. Return false before reading authentication state for
         * requests used to load Oidc.provide's configuration. If core is still loading,
         * a callback that reads authentication state is retried once core is ready.
         * Do not depend on the user model for requests that build that model.
         */
        shouldInjectAccessToken: (req: HttpRequest<unknown>) => boolean;
    }) => HttpInterceptorFn;
    enforceLoginGuard: (
        route: Parameters<CanActivateFn>[0],
        state?: Parameters<CanActivateFn>[1]
    ) => Promise<true>;
};
