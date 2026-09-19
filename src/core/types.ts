import type { OidcInitializationError } from "./OidcInitializationError";
import type { MaybeAsync } from "../tools/MaybeAsync";
import { assert } from "../tools/tsafe/assert";

export declare type Oidc<User = unknown> = Oidc.LoggedIn<User> | Oidc.NotLoggedIn;

export declare namespace Oidc {
    export type Common = {
        issuerUri: string;
        clientId: string;
        validRedirectUri: string;
    };

    export type NotLoggedIn = Common & {
        isUserLoggedIn: false;
        login: (params?: {
            doesCurrentHrefRequiresAuth?: boolean;
            /**
             * Where to redirect after successful login.
             * Default: window.location.href (here)
             *
             * It does not need to include the origin, eg: "/dashboard"
             */
            redirectUrl?: string;

            authorizationParams?: Record<string, string | string[] | undefined>;
            transformAuthorizationUrl?: (params: { authorizationUrl: string }) => string;
        }) => Promise<never>;
        initializationError: OidcInitializationError | undefined;
    };

    export type LoggedIn<User = unknown> = Common & {
        isUserLoggedIn: true;
        renewTokens(): Promise<void>;
        subscribeToTokensChange: (onTokenChange: (tokens: OidcTokens) => void) => {
            unsubscribeFromTokensChange: () => void;
        };
        getTokens: (param?: ParamsOfGetToken) => Promise<OidcTokens>;
        getAccessToken: (params?: ParamsOfGetToken) => Promise<string>;
        logout: (
            params: { redirectTo: "home" | "current page" } | { redirectTo: "specific url"; url: string }
        ) => Promise<never>;
        goToAuthServer: (params: {
            authorizationParams?: Record<string, string | string[] | undefined>;
            transformAuthorizationUrl?: (params: { authorizationUrl: string }) => string;
            redirectUrl?: string;
        }) => Promise<never>;
        subscribeToAutoLogoutCountdown: (
            tickCallback: (params: { secondsLeft: number | undefined }) => void
        ) => { unsubscribeFromAutoLogoutCountdown: () => void };
        /**
         * If you called `goToAuthServer` or `login` with extraQueryParams, this object let you know the outcome of the
         * of the action that was intended.
         *
         * For example, on a Keycloak server, if you called `goToAuthServer({ extraQueryParams: { kc_action: "UPDATE_PASSWORD" } })`
         * you'll get back: `{ extraQueryParams: { kc_action: "UPDATE_PASSWORD" }, result: { kc_action_status: "success" } }` (or "cancelled")
         */
        backFromAuthServer:
            | {
                  authorizationParams: Record<string, string | string[]>;
                  result: Record<string, string>;
              }
            | undefined;
        /**
         * This is true when the user has just returned from the login pages.
         * This is also true when the user navigate to your app and was able to be silently signed in because there was still a valid session.
         * This false however when the use just reload the page.
         *
         * This can be used to perform some action related to session initialization
         * but avoiding doing it repeatedly every time the user reload the page.
         *
         * Note that this is referring to the browser session and not the OIDC session
         * on the server side.
         *
         * If you want to perform an action only when a new OIDC session is created
         * you can test oidc.isNewBrowserSession && oidc.backFromAuthServer !== undefined
         */
        isNewBrowserSession: boolean;

        getUser: () => Promise<{
            user: User;
            subscribeToUserChange: (
                onUserChange: (params: { user: User; user_previous: User | undefined }) => void
            ) => {
                unsubscribeFromUserChange: () => void;
            };
            refreshUser: () => Promise<User>;
        }>;
    };

    type ParamsOfGetToken = {
        authorizationParams?: Record<string, string | string[] | undefined>;
        tokenParams?: Record<string, string | string[] | undefined>;
        scope?: string[];
        redirectUrl?: string;
        disableDPoP?: boolean;
    };
}

export type ParamsOfCreateOidc<User, AutoLogin extends boolean> = {
    createUser: CreateUser<User>;

    /**
     * See: https://docs.oidc-spa.dev/v/v10/providers-configuration/provider-configuration
     */
    issuerUri: string;
    /**
     * See: https://docs.oidc-spa.dev/v/v10/providers-configuration/provider-configuration
     */
    clientId: string;
    /**
     * The scopes being requested from the OIDC/OAuth2 provider (default: `["profile"]`
     * (the scope "openid" is added automatically as it's mandatory)
     **/
    scopes?: string[];

    /**
     * Transform the url (authorization endpoint) before redirecting to the login pages.
     *
     * The isSilentRedirect parameter is true when the redirect is initiated in the background iframe for silent signin.
     * This can be used to omit ui related query parameters (like `ui_locales`).
     */
    transformAuthorizationUrl?: (params: {
        authorizationUrl: string;
        isSilentRedirect: boolean;
    }) => string;

    /**
     * Extra query params to be added to the authorization endpoint url before redirecting or silent signing in.
     * You can provide a function that returns those extra query params, it will be called
     * when login() is called.
     *
     * Example: extraQueryParams: ()=> ({ ui_locales: "fr" })
     *
     * This parameter can also be passed to login() directly.
     */
    authorizationParams?:
        | Record<string, string | string[] | undefined>
        | ((params: { isSilentRedirect: boolean }) => Record<string, string | string[] | undefined>);

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
    tokenParams?: Record<string, string | string[] | undefined>;

    /**
     * This parameter defines after how many seconds of inactivity the user should be
     * logged out automatically.
     *
     * WARNING: It should be configured on the identity server side
     * as it's the authoritative source for security policies and not the client.
     * If you don't provide this parameter it will be inferred from the refresh token expiration time.
     * Some provider however don't issue a refresh token or do not correctly set the
     * expiration time. This parameter enable you to hard code the value to compensate
     * the shortcoming of your auth server.
     * */
    idleSessionLifetimeInSeconds?: number;

    /**
     * Where to redirect when auto logout happens due to session expiration
     * on the Keycloak server.
     *
     * Example:
     * autoLogout_redirectionTarget: { redirectTo: "current page" } // Default
     * autoLogout_redirectionTarget: { redirectTo: "home" }
     * autoLogout_redirectionTarget: { redirectTo: "specific url", url: "/your-session-has-expired" }
     * autoLogout_redirectionTarget: {
     *      redirectTo: "specific url",
     *      get url(){ return `/your-session-has-expired?return_url=${encodeURIComponent(location.href)}`; }
     * }
     */
    autoLogout_redirectionTarget?:
        | {
              redirectTo: "home" | "current page";
          }
        | {
              redirectTo: "specific url";
              url: string;
          };

    autoLogin?: AutoLogin;

    /**
     * NOTE: Can be provided as parameter to the Vite plugin or to oidcEarlyInit()
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
     *
     *  See: https://docs.oidc-spa.dev/v/v10/resources/third-party-cookies-and-session-restoration
     */
    sessionRestorationMethod?: "iframe" | "full page redirect" | "auto";

    debugLogs?: boolean;

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
    __oidcProviderMetadata?: OidcProviderMetadata;

    /**
     * This is only for opting out of DPoP for a specific OIDC client instance.
     * To enable DPoP see: https://docs.oidc-spa.dev/v/v10/security-features/dpop
     * */
    disableDPoP?: true;

    /**
     * This parameter take effect only when autoLogin is true.
     * It tells where to redirect after a successful autoLogin.
     *
     * If you are not in autoLogin mode there is absolutely no reason to use
     * this parameter since you can pass `login({ redirectUrl: "..." })`.
     *
     * It can only be useful in some edge case with `autoLogin: true`
     * When you want to precisely redirect somewhere after login.
     *
     * This can make sense if you have multiple clients to talk with different
     * API and no iframe capabilities.
     */
    autoLogin_redirectUrl?: string;
};

export type OidcTokens = OidcTokens.WithRefreshToken | OidcTokens.WithoutRefreshToken;

export namespace OidcTokens {
    export type Common = {
        accessToken: string;
        /** Millisecond epoch in the server's time */
        accessTokenExpirationTime: number;
        idToken: string;
        idTokenClaims: IdTokenClaims;
        /** Millisecond epoch in the server's time, read from id_token's JWT, iat claim value */
        issuedAtTime: number;

        /** To use instead of Date.now() if you ever need to tell if a token is expired or not */
        getServerDateNow: () => number;
    };

    export type WithRefreshToken = Common & {
        hasRefreshToken: true;
        refreshToken: string;
        refreshTokenExpirationTime: number | undefined;
    };

    export type WithoutRefreshToken = Common & {
        hasRefreshToken: false;
        refreshToken?: never;
        refreshTokenExpirationTime?: never;
    };
}

export type CreateUser<User> = (params: {
    idTokenClaims: IdTokenClaims;
    accessToken: string;
    fetchUserInfo: () => Promise<OidcUserInfo>;
    issuerUri: string;
    clientId: string;
    validRedirectUri: string;
    user_current: User | undefined;
}) => MaybeAsync<User>;

export type OidcUserInfo = {
    sub: string;

    name?: string;
    given_name?: string;
    family_name?: string;
    middle_name?: string;
    nickname?: string;
    preferred_username?: string;

    profile?: string;
    picture?: string;
    website?: string;

    email?: string;
    email_verified?: boolean;

    gender?: string;
    birthdate?: string;

    zoneinfo?: string;
    locale?: string;

    phone_number?: string;
    phone_number_verified?: boolean;

    address?: {
        formatted?: string;
        street_address?: string;
        locality?: string;
        region?: string;
        postal_code?: string;
        country?: string;
    };

    updated_at?: number;

    // UserInfo may contain additional provider-specific claims.
    [claim: string]: unknown;
};

export type IdTokenClaims = {
    // REQUIRED
    iss: string; // Issuer Identifier
    sub: string; // Subject Identifier
    aud: string | string[]; // Audience(s)
    exp: number; // Expiration time (Unix seconds)
    iat: number; // Issued-at time (Unix seconds)

    // CONDITIONAL
    auth_time?: number; // Authentication time
    nonce?: string; // Nonce
    acr?: string; // Authentication Context Class Reference
    amr?: string[]; // Authentication Methods References
    azp?: string; // Authorized party (for multiple audiences)

    // OPTIONAL standard user claims (OpenID §5.1)
    name?: string;
    given_name?: string;
    family_name?: string;
    middle_name?: string;
    nickname?: string;
    preferred_username?: string;
    profile?: string;
    picture?: string;
    website?: string;
    email?: string;
    email_verified?: boolean;
    gender?: string;
    birthdate?: string;
    zoneinfo?: string;
    locale?: string;
    phone_number?: string;
    phone_number_verified?: boolean;
    address?: Record<string, unknown>;
    updated_at?: number;

    [claimName: string]: unknown;
};

export type OidcProviderMetadata = {
    authorization_endpoint: string;
    token_endpoint: string;

    userinfo_endpoint?: string;
    end_session_endpoint?: string;
    dpop_signing_alg_values_supported?: string[];
};

assert<
    Exclude<
        keyof OidcProviderMetadata,
        "dpop_signing_alg_values_supported"
    > extends keyof import("../vendor/frontend/oidc-client-ts").OidcMetadata
        ? true
        : false
>;
