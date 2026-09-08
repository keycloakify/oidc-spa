import type { Oidc as Oidc_core, OidcInitializationError, ParamsOfCreateOidc } from "../core";
import type { OidcMetadata } from "../core/OidcMetadata";
import { assert, type Equals } from "../tools/tsafe/assert";
import type { MaybeAsync } from "../tools/MaybeAsync";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";
import type { Signal, EnvironmentProviders } from "@angular/core";
import type { HttpInterceptorFn, HttpRequest } from "@angular/common/http";
import type { CanActivateFn } from "@angular/router";

export type InjectOidc<User> = {
    (params?: { assert?: undefined }): InjectOidc.Oidc<User>;
    (params: { assert: "user logged in" }): InjectOidc.Oidc.LoggedIn<User>;
    (params: { assert: "user not logged in" }): InjectOidc.Oidc.NotLoggedIn;
};

export namespace InjectOidc {
    export type WithAutoLogin<User> = () => Oidc.LoggedIn<User>;

    export type Oidc<User> =
        | (Oidc.NotLoggedIn & {
              logout?: never;
              renewTokens?: never;
              goToAuthServer?: never;
              backFromAuthServer?: never;
              isNewBrowserSession?: never;
              user?: never;
              refreshUser?: never;
              getAccessToken?: never;
          })
        | (Oidc.LoggedIn<User> & {
              login?: never;
          });

    export namespace Oidc {
        export type NotLoggedIn = {
            issuerUri: string;
            clientId: string;
            validRedirectUri: string;
            /** Remains pending during SSR. Defer authentication-dependent UI until it resolves. */
            prInitialized: Promise<true>;
            initializationError: OidcInitializationError | undefined;

            isUserLoggedIn: false;
            autoLogoutState: Signal<{
                shouldDisplayWarning: false;
            }>;

            login: (params?: {
                extraQueryParams?: Record<string, string | undefined>;
                redirectUrl?: string;
                transformUrlBeforeRedirect?: (url: string) => string;
                doesCurrentHrefRequiresAuth?: boolean;
            }) => Promise<never>;
        };

        export type LoggedIn<User> = {
            issuerUri: string;
            clientId: string;
            validRedirectUri: string;
            /** Remains pending during SSR. Defer authentication-dependent UI until it resolves. */
            prInitialized: Promise<true>;
            /**
             *  If you haven't enabled autoLogin:
             *  This error can be defined only if your createUser function throws.
             */
            initializationError: OidcInitializationError | undefined;

            isUserLoggedIn: true;
            autoLogoutState: Signal<
                | {
                      shouldDisplayWarning: true;
                      secondsLeftBeforeAutoLogout: number;
                  }
                | {
                      shouldDisplayWarning: false;
                  }
            >;

            logout: Oidc_core.LoggedIn["logout"];
            renewTokens: Oidc_core.LoggedIn["renewTokens"];
            goToAuthServer: Oidc_core.LoggedIn["goToAuthServer"];
            backFromAuthServer: Oidc_core.LoggedIn["backFromAuthServer"];
            isNewBrowserSession: boolean;
            user: Signal<User>;
            refreshUser: () => Promise<User>;
            getAccessToken: () => Promise<string>;
        };
    }
}

export type GetOidc<User> = {
    (params?: { assert?: undefined }): Promise<GetOidc.Oidc<User>>;
    (params: { assert: "user logged in" }): Promise<GetOidc.Oidc.LoggedIn<User>>;
    (params: { assert: "user not logged in" }): Promise<GetOidc.Oidc.NotLoggedIn>;
};

export namespace GetOidc {
    export type WithAutoLogin<User> = (params?: {
        assert: "user logged in";
    }) => Promise<Oidc.LoggedIn<User>>;

    export type Oidc<User> =
        | (Oidc.NotLoggedIn & {
              getAccessToken?: never;
              subscribeToAccessTokenRotation?: never;
              logout?: never;
              renewTokens?: never;
              goToAuthServer?: never;
              backFromAuthServer?: never;
              isNewBrowserSession?: never;
              subscribeToAutoLogoutState?: never;
              getUser?: never;
          })
        | (Oidc.LoggedIn<User> & {
              initializationError?: never;
              login?: never;
          });

    export namespace Oidc {
        type Common = {
            issuerUri: string;
            clientId: string;
        };

        export type NotLoggedIn = Common & {
            isUserLoggedIn: false;
            initializationError: OidcInitializationError | undefined;
            login: Oidc_core.NotLoggedIn["login"];
        };

        export type LoggedIn<User> = Common & {
            isUserLoggedIn: true;
            getAccessToken: () => Promise<string>;
            subscribeToAccessTokenRotation: (next: (accessToken: string) => void) => {
                unsubscribeFromAccessTokenRotation: () => void;
            };
            logout: Oidc_core.LoggedIn["logout"];
            renewTokens: Oidc_core.LoggedIn["renewTokens"];
            goToAuthServer: Oidc_core.LoggedIn["goToAuthServer"];
            backFromAuthServer: Oidc_core.LoggedIn["backFromAuthServer"];
            isNewBrowserSession: boolean;
            subscribeToAutoLogoutState: (
                next: (
                    autoLogoutState:
                        | {
                              shouldDisplayWarning: true;
                              secondsLeftBeforeAutoLogout: number;
                          }
                        | {
                              shouldDisplayWarning: false;
                          }
                ) => void
            ) => { unsubscribeFromAutoLogoutState: () => void };
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
    }
}

export type ParamsOfProvide<AutoLogin, User> =
    | ParamsOfProvide.Real
    | ParamsOfProvide.Mock<AutoLogin, User>;

export namespace ParamsOfProvide {
    export type Real = {
        implementation: "real";

        /**
         * See: https://docs.oidc-spa.dev/v/v10/providers-configuration/provider-configuration
         */
        issuerUri: string;
        /**
         * See: https://docs.oidc-spa.dev/v/v10/providers-configuration/provider-configuration
         */
        clientId: string;

        /**
         * Default: 60 second.
         * It defines how long before the auto logout we should start
         * displaying an overlay message to the user alerting them
         * like: "Are you still there? You'll be disconnected in 59...58..."
         * NOTE: This parameter is only UI related! It does not defines
         * after how much time of inactivity the user should be auto logged out.
         * This is a server policy (that can be overwrote by idleSessionLifetimeInSeconds)
         * See: https://docs.oidc-spa.dev/v/v10/auto-logout
         */
        warnUserSecondsBeforeAutoLogout?: number;
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
        extraTokenParams?:
            | Record<string, string | undefined>
            | (() => Record<string, string | undefined>);

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
         *  WARNING: Setting this to true is a workaround for provider
         *  like Google OAuth that don't support JWT access token.
         *  Use at your own risk, this is a hack.
         */
        __unsafe_useIdTokenAsAccessToken?: boolean;

        /**
         * Usage discouraged, this parameter exists because we don't want to assume
         * too much about your usecase but I can't think of a scenario where you would
         * want anything other than the current page.
         *
         * Default: { redirectTo: "current page" }
         */
        autoLogoutParams?: Parameters<Oidc_core.LoggedIn<any>["logout"]>[0];

        /**
         * This is only for opting out of DPoP for a specific OIDC client instance.
         * To enable DPoP see: https://docs.oidc-spa.dev/v/v10/security-features/dpop
         * */
        disableDPoP?: true;
    };

    assert<
        Equals<
            Omit<Real, "implementation" | "warnUserSecondsBeforeAutoLogout">,
            Omit<
                import("../core").ParamsOfCreateOidc<any, boolean>,
                "BASE_URL" | "decodedIdTokenSchema" | "createUser" | "autoLogin" | "postLoginRedirectUrl"
            >
        >
    >;

    export type Mock<AutoLogin, User> = {
        implementation: "mock";
        issuerUri_mock?: string;
        clientId_mock?: string;
        user_mock?: User;
    } & (AutoLogin extends true
        ? {
              isUserInitiallyLoggedIn?: true;
          }
        : {
              isUserInitiallyLoggedIn: boolean;
          });
}

export type OidcSpaUtils<AutoLogin, User> = {
    provideOidc: (params: ValueOrAsyncGetter<ParamsOfProvide<AutoLogin, User>>) => EnvironmentProviders;
    /**
     * Can be injected during SSR; prInitialized stays pending on the server.
     * Gate auth UI with @defer (when oidc.prInitialized | async).
     * Assertions read authentication state and require initialization to have completed.
     */
    injectOidc: AutoLogin extends true ? InjectOidc.WithAutoLogin<User> : InjectOidc<User>;
    getOidc: AutoLogin extends true ? GetOidc.WithAutoLogin<User> : GetOidc<User>;
    createOidcInterceptor: (params: {
        /**
         * May inject services. Return false before reading authentication state for
         * requests used to load provideOidc's configuration. If core is still loading,
         * a callback that reads authentication state is retried once core is ready.
         * Do not depend on the user model for requests that build that model.
         */
        shouldInjectAccessToken: (req: HttpRequest<unknown>) => boolean;
    }) => HttpInterceptorFn;
} & (AutoLogin extends true
    ? {}
    : {
          /**
           * Protected routes must use renderMode: RenderMode.Client in app.routes.server.ts.
           * Throws during SSR because authentication can only be established in the browser.
           */
          enforceLoginGuard: (
              route: Parameters<CanActivateFn>[0],
              state?: Parameters<CanActivateFn>[1]
          ) => Promise<true>;
      });

export type CreateUser<User> = (params: {
    decodedIdToken: Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec;
    accessToken: string;
    fetchUserInfo: () => Promise<{
        [key: string]: unknown;
        sub: string;
    }>;
    issuerUri: string;
    clientId: string;
    validRedirectUri: string;
    user_current: User | undefined;
}) => MaybeAsync<User>;

assert<Equals<CreateUser<{ _brand: string }>, ParamsOfCreateOidc.CreateUser<{ _brand: string }>>>;
