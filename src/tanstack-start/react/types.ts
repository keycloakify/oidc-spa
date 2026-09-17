import type {
    Oidc as Oidc_core,
    OidcInitializationError,
    //ParamsOfCreateOidc,
    IdTokenClaims
} from "../../core";
import type { FunctionMiddlewareAfterServer, RequestMiddlewareAfterServer } from "@tanstack/react-start";
import type { GetterOrDirectValue } from "../../tools/GetterOrDirectValue";
import type { OidcMetadata } from "../../core/OidcMetadata";
import type { MaybeAsync } from "../../tools/MaybeAsync";
//import { assert, type Equals } from "../../tools/tsafe/assert";
import type { AccessTokenClaims_specs as AccessTokenClaims } from "../../server";

export type { IdTokenClaims, AccessTokenClaims };

export type UseOidc<User_client> = {
    (params?: { assert?: undefined }): UseOidc.Oidc<User_client>;
    (params: { assert: "user logged in" }): UseOidc.Oidc.LoggedIn<User_client>;
    (params: { assert: "user not logged in" }): UseOidc.Oidc.NotLoggedIn;
};

export namespace UseOidc {
    export type WithAutoLogin<User_client> = (params?: {
        assert: "ready";
    }) => Oidc.LoggedIn<User_client>;

    export type Oidc<User_client> =
        | (Oidc.NotReady & {
              isUserLoggedIn?: never;
              issuerUri?: never;
              clientId?: never;
              validRedirectUri?: never;

              logout?: never;
              renewTokens?: never;
              goToAuthServer?: never;
              backFromAuthServer?: never;
              isNewBrowserSession?: never;

              login?: never;
              user?: never;
              refreshUser?: never;
          })
        | (Oidc.NotLoggedIn & {
              logout?: never;
              renewTokens?: never;
              goToAuthServer?: never;
              backFromAuthServer?: never;
              isNewBrowserSession?: never;
              user?: never;
              refreshUser?: never;
          })
        | (Oidc.LoggedIn<User_client> & {
              login?: never;
              oidcInitializationError?: never;
          });

    export namespace Oidc {
        export type NotReady = {
            isOidcReady: false;
            autoLogoutState: {
                shouldDisplayWarning: false;
            };
            oidcInitializationError: OidcInitializationError | undefined;
        };

        export type NotLoggedIn = {
            isOidcReady: true;
            isUserLoggedIn: false;
            issuerUri: string;
            clientId: string;
            validRedirectUri: string;
            login: (params?: {
                extraQueryParams?: Record<string, string | undefined>;
                redirectUrl?: string;
                transformUrlBeforeRedirect?: (authorizationUrl: string) => string;
            }) => Promise<never>;
            autoLogoutState: {
                shouldDisplayWarning: false;
            };
            oidcInitializationError: OidcInitializationError | undefined;
        };

        export type LoggedIn<User_client> = {
            isOidcReady: true;
            isUserLoggedIn: true;
            issuerUri: string;
            clientId: string;
            validRedirectUri: string;
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
            user: User_client;
            refreshUser: () => Promise<User_client>;
        };
    }
}

export type GetOidc<User_client> = {
    (params?: { assert?: undefined }): Promise<GetOidc.Oidc<User_client>>;
    (params: { assert: "user logged in" }): Promise<GetOidc.Oidc.LoggedIn<User_client>>;
    (params: { assert: "user not logged in" }): Promise<GetOidc.Oidc.NotLoggedIn>;
};

export namespace GetOidc {
    export type WithAutoLogin<User_client> = (params?: {
        assert: "user logged in";
    }) => Promise<Oidc.LoggedIn<User_client>>;

    export type Oidc<User_client> =
        | (Oidc.NotLoggedIn & {
              getAccessToken?: never;
              subscribeToTokenRotation?: never;
              getIdTokenClaims?: never;
              logout?: never;
              renewTokens?: never;
              goToAuthServer?: never;
              backFromAuthServer?: never;
              isNewBrowserSession?: never;
              subscribeToAutoLogoutState?: never;
              getUser?: never;
          })
        | (Oidc.LoggedIn<User_client> & {
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

        export type LoggedIn<User_client> = Common & {
            isUserLoggedIn: true;
            getAccessToken: () => Promise<string>;
            subscribeAccessTokenRotation: (next: (params: { accessToken: string }) => void) => {
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
                user: User_client;
                subscribeToUserChange: (
                    onUserChange: (params: {
                        user: User_client;
                        user_previous: User_client | undefined;
                    }) => void
                ) => {
                    unsubscribeFromUserChange: () => void;
                };
                refreshUser: () => Promise<User_client>;
            }>;
        };
    }
}

export type OidcFnMiddleware<User_server> = {
    (params?: {
        require?: undefined;
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }): OidcFnMiddleware.TanStackFnMiddleware<{
        oidc: OidcServerContext<User_server>;
    }>;
    (params?: {
        require?: "authed request";
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }): OidcFnMiddleware.TanStackFnMiddleware<{
        oidc: OidcServerContext.LoggedIn<User_server>;
    }>;
};

export namespace OidcFnMiddleware {
    export type WithAutoLogin<User_server> = (params?: {
        require?: "authed request";
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }) => TanStackFnMiddleware<{
        oidc: OidcServerContext.LoggedIn<User_server>;
    }>;

    export type TanStackFnMiddleware<T> = FunctionMiddlewareAfterServer<
        {},
        unknown,
        undefined,
        T,
        {},
        undefined,
        undefined
    >;
}

export type OidcServerContext<User_server> =
    | OidcServerContext.LoggedIn<User_server>
    | (OidcServerContext.NotLoggedIn & {
          user?: never;
          accessToken?: never;
      });

export namespace OidcServerContext {
    export type NotLoggedIn = {
        isAuthedRequest: false;
    };

    export type LoggedIn<User_server> = {
        isAuthedRequest: true;
        user: User_server;
        accessToken: string;
    };
}

export type OidcRequestMiddleware<User_server> = {
    (params?: {
        require?: undefined;
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }): OidcRequestMiddleware.TanstackRequestMiddleware<{
        oidc: OidcServerContext<User_server>;
    }>;
    (params?: {
        require?: "authed request";
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }): OidcRequestMiddleware.TanstackRequestMiddleware<{
        oidc: OidcServerContext.LoggedIn<User_server>;
    }>;
};

export namespace OidcRequestMiddleware {
    export type WithAutoLogin<User_server> = (params?: {
        require?: "authed request";
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }) => TanstackRequestMiddleware<{
        oidc: OidcServerContext.LoggedIn<User_server>;
    }>;

    export type TanstackRequestMiddleware<T> = RequestMiddlewareAfterServer<{}, undefined, T>;
}

export type ParamsOfBootstrap<User_client, User_server, AutoLogin> =
    | ParamsOfBootstrap.Real
    | ParamsOfBootstrap.Mock<AutoLogin>;

export namespace ParamsOfBootstrap {
    export type Real = {
        mode: "real";
        /**
         * See: https://docs.oidc-spa.dev/v/v10/providers-configuration/provider-configuration
         */
        issuerUri: string;
        debugLogs?: boolean;
        server:
            | {
                  accessTokenValidationMethod: "offline JWT validation";
                  expectedAccessTokenAudience: string;
              }
            | {
                  accessTokenValidationMethod: "introspection endpoint";
                  clientId: string;
                  clientSecret: string;
              };
        client: {
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
            transformUrlBeforeRedirect?: (params: {
                authorizationUrl: string;
                isSilent: boolean;
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
    };

    /*
    assert<
        Equals<
            Omit<Real, "implementation" | "warnUserSecondsBeforeAutoLogout">,
            Omit<
                ParamsOfCreateOidc<any, boolean>,
                "BASE_URL" | "createUser" | "autoLogin" | "postLoginRedirectUrl"
            >
        >
    >;
    */

    export type Mock<AutoLogin> = {
        mode: "mock";
        issuerUri_mock?: string;
        accessToken_mock?: string;
        server?: {
            accessTokenClaims_mock?: AccessTokenClaims;
        };
        client?: {
            clientId_mock?: string;
            idTokenClaims_mock?: IdTokenClaims;
        } & (AutoLogin extends true
            ? {
                  isUserInitiallyLoggedIn?: true;
              }
            : {
                  isUserInitiallyLoggedIn: boolean;
              });
    };
}

export type OidcSpaUtils<User_client, User_server, AutoLogin> = {
    bootstrapOidc: (
        params: GetterOrDirectValue<
            { process: { env: Record<string, string> } },
            ParamsOfBootstrap<User_client, User_server, AutoLogin>
        >
    ) => void;
    useOidc: AutoLogin extends true ? UseOidc.WithAutoLogin<User_client> : UseOidc<User_client>;
    getOidc: AutoLogin extends true ? GetOidc.WithAutoLogin<User_client> : GetOidc<User_client>;
} & (AutoLogin extends true
    ? {}
    : {
          enforceLogin: (loaderContext: {
              cause: "preload" | string;
              location: {
                  href: string;
              };
          }) => Promise<void | never>;
      }) &
    (User_server extends undefined
        ? {}
        : {
              oidcFnMiddleware: AutoLogin extends true
                  ? OidcFnMiddleware.WithAutoLogin<User_server>
                  : OidcFnMiddleware<User_server>;
              oidcRequestMiddleware: AutoLogin extends true
                  ? OidcRequestMiddleware.WithAutoLogin<User_server>
                  : OidcRequestMiddleware<User_server>;
          });

export type OidcUserInfo = import("../../core").OidcUserInfo;

export type CreateClientUser<User_client> = (params: {
    isMock: boolean;
    idTokenClaims: IdTokenClaims;
    accessToken: string;
    fetchUserInfo: () => Promise<OidcUserInfo>;
    issuerUri: string;
    clientId: string;
    validRedirectUri: string;
    user_current: User_client | undefined;
}) => MaybeAsync<User_client>;

export type CreateServerUser<User_server> = (params: {
    isMock: boolean;
    accessTokenClaims: AccessTokenClaims;
    accessToken: string;
}) => MaybeAsync<User_server>;
