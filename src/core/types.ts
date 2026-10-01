import type { OidcInitializationError } from "./OidcInitializationError";
import type { MaybeAsync } from "../tools/MaybeAsync";
import { assert } from "../tools/tsafe/assert";

export declare type Oidc<User = unknown> =
    | (Oidc.NotLoggedIn & {
          renewTokens?: never;
          subscribeToTokensChange?: never;
          getTokens?: never;
          getAccessToken?: never;
          logout?: never;
          startAuthorization?: never;
          subscribeToAutoLogoutState?: never;
          authorizationResult?: never;
          isNewBrowserSession?: never;
          getUser?: never;
          subscribeToUserChange?: never;
          refreshUser?: never;
      })
    | (Oidc.LoggedIn<User> & {
          login?: never;
          initializationError?: never;
      });

export declare namespace Oidc {
    export type Common = {
        issuerUri: string;
        clientId: string;
        /**
         * The single redirect URI used by oidc-spa. This exact value must be registered as a
         * valid redirect URI for the client on the authorization server.
         */
        validRedirectUri: string;
    };

    export type NotLoggedIn = Common & {
        isUserLoggedIn: false;
        login: (params?: {
            /**
             * Whether navigating to the current href while logged out causes the application to
             * enforce login.
             *
             * This enables oidc-spa to handle back navigation from the authorization server
             * without immediately redirecting the user to it again.
             *
             * Default: false
             */
            doesCurrentHrefEnforceLogin?: boolean;
            /**
             * Where the user should be returned to after login.
             *
             * Default: `window.location.href` at the time `login()` is called.
             *
             * It does not need to include the origin, for example: `"/dashboard"`.
             */
            returnToUrl?: string;

            authorizationParams?: Record<string, string | string[] | undefined>;
            transformAuthorizationUrl?: (params: { authorizationUrl: string }) => string;
        }) => Promise<never>;
        initializationError: OidcInitializationError | undefined;
    };

    export type LoggedIn<User = unknown> = Common & {
        isUserLoggedIn: true;
        /**
         * Forces the current token set to be renewed.
         */
        renewTokens: () => Promise<void>;
        /**
         * Subscribes to changes to the primary token set.
         *
         * NOTE: Token sets obtained by passing parameters to `getTokens()` or `getAccessToken()` are
         * managed separately and are not reported to this subscriber.
         */
        subscribeToTokensChange: (next: (tokens: OidcTokens) => void) => {
            unsubscribeFromTokensChange: () => void;
        };
        /**
         * Returns a valid token set for the requested authorization configuration.
         *
         * Without parameters, this returns the primary token set, renewing it first when needed.
         * When parameters are provided, oidc-spa obtains and separately manages a token set
         * matching that configuration. This can cause a full-page redirect when silent
         * authorization is not available.
         */
        getTokens: (params?: ParamsOfGetToken) => Promise<OidcTokens>;
        /**
         * Returns a valid access token for the requested authorization configuration.
         *
         * This is equivalent to calling `getTokens()` and reading its `accessToken` property.
         */
        getAccessToken: (params?: ParamsOfGetToken) => Promise<string>;
        /**
         * Logs the user out and returns them to `returnToUrl`.
         *
         * By default, the user is returned to the current URL.
         */
        logout: (params?: { returnToUrl?: string }) => Promise<never>;
        /**
         * Starts a new authorization round trip for the logged-in user.
         *
         * This can be used for provider-specific actions such as updating the user's password.
         * The outcome is exposed through `authorizationResult` after the user returns.
         */
        startAuthorization: (params?: {
            authorizationParams?: Record<string, string | string[] | undefined>;
            transformAuthorizationUrl?: (params: { authorizationUrl: string }) => string;
            /**
             * Where the user should be redirected after authorization completes.
             *
             * Default: `window.location.href` at the time `startAuthorization()` is called.
             */
            returnToUrl?: string;
        }) => Promise<never>;
        subscribeToAutoLogoutState: (
            next: (
                autoLogoutState:
                    | {
                          shouldDisplayWarning: true;
                          secondsLeftBeforeAutoLogout: number;
                          /** Resets the auto-logout countdown as if user activity was detected. */
                          resetAutoLogoutCountdown: () => void;
                      }
                    | {
                          shouldDisplayWarning: false;
                          secondsLeftBeforeAutoLogout?: never;
                      }
            ) => void
        ) => { unsubscribeFromAutoLogoutState: () => void };
        /**
         * Describes the authorization round trip that brought the user back to the application.
         *
         * For example, after calling
         * `startAuthorization({ authorizationParams: { kc_action: "UPDATE_PASSWORD" } })`
         * with Keycloak, this can contain:
         * `{ authorizationParams: { kc_action: "UPDATE_PASSWORD" }, response: { kc_action_status: "success" } }`.
         *
         * It is `undefined` when the session was restored silently rather than through a
         * full-page authorization round trip.
         */
        authorizationResult:
            | {
                  authorizationParams: Record<string, string | string[]>;
                  response: Record<string, string>;
              }
            | undefined;
        /**
         * This is true when the user has just returned from the login pages.
         * It is also true when the user navigates to the application and is silently signed in
         * because a valid session still exists. It is false when the user merely reloads the page.
         *
         * This can be used to perform session-initialization work without repeating it every time
         * the user reloads the page.
         *
         * This refers to the browser session, not the OIDC session on the authorization server.
         *
         * To perform an action only after a full-page authorization round trip, test
         * `oidc.isNewBrowserSession && oidc.authorizationResult !== undefined`.
         */
        isNewBrowserSession: boolean;

        /**
         * Returns the user representation produced by `createUser`.
         *
         * User creation is lazy: token acquisition and renewal do not invoke `createUser`
         * until either `getUser` or `refreshUser` has been called at least once.
         * `subscribeToUserChange` alone does not initialize the user.
         *
         * The call that initializes user creation invokes `createUser` with the latest tokens.
         * Concurrent calls share the same computation. Once a user has been created
         * successfully, it is cached. When no computation is in progress, this method returns
         * the cached user without invoking `createUser` again.
         *
         * After user creation has been initialized, the user is recomputed automatically when
         * token renewal changes the ID-token claims other than `exp`, `iat`, and `nonce`, or
         * the decoded access-token claims other than `exp`, `iat`, `jti`, `nbf`, and `cnf`.
         * Claims are compared structurally, so object key order and a change to a token's
         * encoded value or signature alone do not cause a recomputation. When the access token
         * is opaque, only changes to the ID-token claims can be detected automatically.
         *
         * If a user refresh or computation is in progress, this method waits for it, including
         * any follow-up computation required by a token change that occurred in the meantime.
         * This guarantees that calling `refreshUser()` and then `getUser()` without awaiting
         * the former returns the refreshed user when the refresh succeeds.
         *
         * If `createUser` fails before any user has been created successfully, this method
         * rejects with an `OidcInitializationError`. A later call retries the creation. If a
         * recomputation fails after a user has been cached, the error is logged and this method
         * returns the last successfully created user. When the failed recomputation was
         * requested explicitly through `refreshUser`, that method's promise still rejects.
         *
         * `createUser` must not await `getUser` or `refreshUser`, directly or indirectly.
         * Synchronous re-entry is rejected; suspected cycles after an asynchronous boundary
         * are diagnosed with a warning after three seconds without rejecting slow requests.
         * Calling `getAccessToken` or `getTokens` from `createUser` is supported.
         *
         * Rejects with an assertion error if `createUser` was not provided to `createOidc()`.
         */
        getUser: () => Promise<User>;

        /**
         * Subscribes to changes in the cached user representation produced by `createUser`.
         *
         * Subscribing does not invoke `createUser` and performs no network request. Once user
         * creation is initialized by `getUser` or `refreshUser`, subscribers registered before
         * the first successful creation are called with `user_previous` set to `undefined`.
         * They are then called after each successful recomputation that produces a user which
         * is not deeply equal to the cached user, with `user_previous` set to that cached value.
         *
         * A subscriber registered after a user has already been cached is not called
         * immediately; use `getUser` to read the current value.
         *
         * Failed computations do not invoke the callback and do not replace the cached user.
         *
         * Throws an assertion error if `createUser` was not provided to `createOidc()`.
         */
        subscribeToUserChange: (
            onUserChange: (params: { user: User; user_previous: User | undefined }) => void
        ) => {
            unsubscribeFromUserChange: () => void;
        };

        /**
         * Renews the tokens and forces a recomputation of the user representation, even when
         * the relevant ID-token and access-token claims have not changed. Calling this method
         * initializes lazy user creation if necessary.
         *
         * The returned promise resolves after the recomputation completes successfully and its
         * result is available through `getUser`. Concurrent user computations are coalesced
         * and `createUser` is never invoked concurrently. If tokens change while a computation
         * is in progress, a follow-up computation uses the latest tokens.
         *
         * If token renewal or `createUser` fails, the promise rejects. Any previously cached
         * user is preserved and remains available through `getUser`. If no user has ever been
         * created successfully, a `createUser` failure is reported as an
         * `OidcInitializationError`.
         *
         * Rejects with an assertion error if `createUser` was not provided to `createOidc()`.
         */
        refreshUser: () => Promise<void>;
    };

    type ParamsOfGetToken = {
        authorizationParams?: Record<string, string | string[] | undefined>;
        tokenParams?: Record<string, string | string[] | undefined>;
        scopes?: string[];
        /**
         * Where the user should be returned if obtaining this token set requires a full-page
         * authorization round trip.
         *
         * Default: `window.location.href` at the time the token set is requested.
         */
        returnToUrl?: string;
        disableDPoP?: boolean;
    };
}

export type ParamsOfCreateOidc<User, AutoLogin extends boolean> = {
    createUser?: CreateUser<User>;

    /**
     * See: https://docs.oidc-spa.dev/v/v10/providers-configuration/provider-configuration
     */
    issuerUri: string;
    /**
     * See: https://docs.oidc-spa.dev/v/v10/providers-configuration/provider-configuration
     */
    clientId: string;
    /**
     * Scopes requested from the OIDC/OAuth2 provider.
     *
     * The `openid` scope is added automatically.
     *
     * Default: `["profile"]`.
     */
    scopes?: string[];

    /**
     * Number of seconds before automatic logout at which `subscribeToAutoLogoutState()`
     * starts reporting that a warning should be displayed.
     *
     * Updates are then emitted every second until automatic logout or until the countdown is
     * reset.
     *
     * Default: 30 seconds.
     */
    warnUserSecondsBeforeAutoLogout?: number;

    /**
     * Transforms an authorization endpoint URL before oidc-spa navigates to it.
     *
     * `isSilentRedirect` is true when authorization is performed in a background iframe. It can
     * be used to omit UI-related query parameters, such as `ui_locales`, during silent
     * authorization.
     */
    transformAuthorizationUrl?: (params: {
        authorizationUrl: string;
        isSilentRedirect: boolean;
    }) => string;

    /**
     * Additional query parameters added to authorization endpoint URLs.
     *
     * A function can be provided when the parameters depend on whether authorization is being
     * performed silently.
     *
     * This option provides defaults. Parameters passed directly to `login()`,
     * `startAuthorization()`, `getTokens()`, or `getAccessToken()` are applied to their specific
     * authorization request.
     *
     * @example
     * authorizationParams: ({ isSilentRedirect }) =>
     *     isSilentRedirect ? {} : { ui_locales: "fr" }
     */
    authorizationParams?:
        | Record<string, string | string[] | undefined>
        | ((params: { isSilentRedirect: boolean }) => Record<string, string | string[] | undefined>);

    /**
     * Additional body parameters added to token endpoint requests.
     *
     * They are used for the initial token request and whenever the primary token set is renewed.
     * Parameters can also be passed to `getTokens()` or `getAccessToken()` when requesting a
     * token set for a different authorization configuration.
     *
     * @example
     * tokenParams: { selectedCustomer: "xxx" }
     */
    tokenParams?: Record<string, string | string[] | undefined>;

    /**
     * Defines after how many seconds of inactivity the user should be logged out automatically.
     *
     * WARNING: It should be configured on the authorization server because the server, rather
     * than the client, is the authoritative source for security policies.
     * If you don't provide this parameter it will be inferred from the refresh token expiration time.
     * Some providers, however, do not issue a refresh token or do not correctly report its
     * expiration time. This parameter lets you provide an explicit value to compensate for
     * those authorization-server limitations.
     */
    idleSessionLifetimeInSeconds?: number;

    /**
     * Where the user should be returned after automatic logout caused by session expiration on
     * the authorization server.
     *
     * By default, the user is returned to the URL they were visiting when automatic logout
     * occurred.
     *
     * @example
     * autoLogout_returnToUrl: "/session-expired"
     *
     * A function can be provided to compute the URL when automatic logout occurs.
     *
     * @example
     * autoLogout_returnToUrl: () =>
     *     `/your-session-has-expired?return_url=${encodeURIComponent(location.href)}`
     */
    autoLogout_returnToUrl?: string | (() => string);

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
     */
    disableDPoP?: true;

    autoLogin?: AutoLogin;

    /**
     * Where the user should be returned after a successful automatic login.
     *
     * This option takes effect only when `autoLogin` is true. Otherwise, pass `returnToUrl`
     * directly to `login()`.
     *
     * This is useful, for example, when using multiple OIDC clients for different resource
     * servers without iframe support.
     */
    autoLogin_returnToUrl?: string;
};

export type ParamsOfCreateMockOidc<User, AutoLogin extends boolean> = {
    createUser_mock?: CreateUser<User>;
    autoLogin?: AutoLogin;
    /** Default: true */
    isUserInitiallyLoggedIn?: boolean;
    issuerUri_mock?: string;
    clientId_mock?: string;
    idTokenClaims_mock?: IdTokenClaims;
    idToken_mock?: string;
    accessToken_mock?: string;
    refreshToken_mock?: string;
    autoLogin_returnToUrl?: string;
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
