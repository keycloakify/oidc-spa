import type { ReactNode, ComponentType } from "react";
import type { Oidc as Oidc_core, OidcInitializationError } from "../core";
import type { OidcMetadata } from "../core/OidcMetadata";

export type UseOidc<DecodedIdToken> = {
    (params?: { assert?: undefined }): UseOidc.Oidc<DecodedIdToken>;
    (params: { assert: "user logged in" }): UseOidc.Oidc.LoggedIn<DecodedIdToken>;
    (params: { assert: "user not logged in" }): UseOidc.Oidc.NotLoggedIn;
};

export namespace UseOidc {
    export type WithAutoLogin<DecodedIdToken> = () => Oidc.LoggedIn<DecodedIdToken>;

    export type Oidc<DecodedIdToken> =
        | (Oidc.NotLoggedIn & {
              decodedIdToken?: never;
              logout?: never;
              renewTokens?: never;
              goToAuthServer?: never;
              backFromAuthServer?: never;
              isNewBrowserSession?: never;
          })
        | (Oidc.LoggedIn<DecodedIdToken> & {
              login?: never;
              initializationError?: never;
          });

    export namespace Oidc {
        export type NotLoggedIn = {
            issuerUri: string;
            clientId: string;
            validRedirectUri: string;
            login: (params?: {
                extraQueryParams?: Record<string, string | undefined>;
                redirectUrl?: string;
                transformUrlBeforeRedirect?: (url: string) => string;
            }) => Promise<never>;
            autoLogoutState: {
                shouldDisplayWarning: false;
            };
            isUserLoggedIn: false;
            initializationError: OidcInitializationError | undefined;
        };

        export type LoggedIn<DecodedIdToken> = {
            issuerUri: string;
            clientId: string;
            validRedirectUri: string;
            isUserLoggedIn: true;
            decodedIdToken: DecodedIdToken;
            logout: Oidc_core.LoggedIn["logout"];
            renewTokens: Oidc_core.LoggedIn["renewTokens"];
            goToAuthServer: Oidc_core.LoggedIn["goToAuthServer"];
            backFromAuthServer: Oidc_core.LoggedIn["backFromAuthServer"];
            isNewBrowserSession: boolean;
            autoLogoutState:
                | {
                      shouldDisplayWarning: true;
                      secondsLeftBeforeAutoLogout: number;
                  }
                | {
                      shouldDisplayWarning: false;
                  };
        };
    }
}

export type GetOidc<DecodedIdToken> = {
    (params?: { assert?: undefined }): Promise<GetOidc.Oidc<DecodedIdToken>>;
    (params: { assert: "user logged in" }): Promise<GetOidc.Oidc.LoggedIn<DecodedIdToken>>;
    (params: { assert: "user not logged in" }): Promise<GetOidc.Oidc.NotLoggedIn>;
};

export namespace GetOidc {
    export type WithAutoLogin<DecodedIdToken> = (params?: {
        assert: "user logged in";
    }) => Promise<Oidc.LoggedIn<DecodedIdToken>>;

    export type Oidc<DecodedIdToken> =
        | (Oidc.NotLoggedIn & {
              getAccessToken?: never;
              subscribeToAccessTokenRotation?: never;
              getDecodedIdToken?: never;
              subscribeToDecodedIdTokenChange?: never;
              logout?: never;
              renewTokens?: never;
              goToAuthServer?: never;
              backFromAuthServer?: never;
              isNewBrowserSession?: never;
              subscribeToAutoLogoutState?: never;
          })
        | (Oidc.LoggedIn<DecodedIdToken> & {
              initializationError?: never;
              login?: never;
          });

    export namespace Oidc {
        type Common = {
            issuerUri: string;
            clientId: string;
            validRedirectUri: string;
        };

        export type NotLoggedIn = Common & {
            isUserLoggedIn: false;
            initializationError: OidcInitializationError | undefined;
            login: Oidc_core.NotLoggedIn["login"];
        };

        export type LoggedIn<DecodedIdToken> = Common & {
            isUserLoggedIn: true;
            getAccessToken: () => Promise<string>;
            subscribeToAccessTokenRotation: (next: (accessToken: string) => void) => {
                unsubscribeFromAccessTokenRotation: () => void;
            };
            getDecodedIdToken: () => DecodedIdToken;
            subscribeToDecodedIdTokenChange: (next: (decodedIdToken: DecodedIdToken) => void) => {
                unsubscribeFromDecodedIdTokenChange: () => void;
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
        };
    }
}

export type ParamsOfBootstrap<AutoLogin, DecodedIdToken> =
    | ParamsOfBootstrap.Real<AutoLogin>
    | ParamsOfBootstrap.Mock<AutoLogin, DecodedIdToken>;

export namespace ParamsOfBootstrap {
    export type Real<AutoLogin> = {
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
         * Let's you override the params passed to
         * (if you weren't able to provide it)
         */
        BASE_URL?: string;

        /**
         * This is only for opting out of DPoP for a specific OIDC client instance.
         * To enable DPoP see: https://docs.oidc-spa.dev/v/v10/security-features/dpop
         * */
        disableDPoP?: true;
    } & (AutoLogin extends true ? {} : {});

    export type Mock<AutoLogin, DecodedIdToken> = {
        implementation: "mock";
        issuerUri_mock?: string;
        clientId_mock?: string;
        decodedIdToken_mock?: DecodedIdToken;

        /**
         * Let's you override the params passed to
         * (if you weren't able to provide it)
         */
        BASE_URL?: string;
    } & (AutoLogin extends true
        ? {
              isUserInitiallyLoggedIn?: true;
          }
        : {
              isUserInitiallyLoggedIn: boolean;
          });
}

export type OidcSpaUtils<AutoLogin, DecodedIdToken> = {
    bootstrapOidc: (params: ParamsOfBootstrap<AutoLogin, DecodedIdToken>) => Promise<void>;
    useOidc: AutoLogin extends true ? UseOidc.WithAutoLogin<DecodedIdToken> : UseOidc<DecodedIdToken>;
    getOidc: AutoLogin extends true ? GetOidc.WithAutoLogin<DecodedIdToken> : GetOidc<DecodedIdToken>;
    OidcInitializationGate: (props: { fallback?: ReactNode; children: ReactNode }) => ReactNode;
} & (AutoLogin extends true
    ? {
          OidcInitializationErrorGate: (props: {
              errorComponent: ComponentType<{
                  oidcInitializationError: OidcInitializationError;
              }>;
              children: ReactNode;
          }) => ReactNode;
      }
    : {
          enforceLogin: (loaderContext: {
              request?: { url?: string };
              cause?: "preload" | string;
              location?: {
                  href?: string;
              };
          }) => Promise<void | never>;

          withLoginEnforced: <Props extends Record<string, unknown>>(
              component: ComponentType<Props>
          ) => (props: Props) => ReactNode;
      });
