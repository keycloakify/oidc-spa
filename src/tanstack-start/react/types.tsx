import type { ReactNode } from "react";
import type { Oidc as Oidc_core, OidcInitializationError } from "../../core";
import type { FunctionMiddlewareAfterServer, RequestMiddlewareAfterServer } from "@tanstack/react-start";
import type { GetterOrDirectValue } from "../../tools/GetterOrDirectValue";
import type { OidcMetadata } from "../../core/OidcMetadata";

export type CreateOidcComponent<DecodedIdToken> = <
    Assert extends "user logged in" | "user not logged in" | undefined,
    Props
>(params: {
    assert?: Assert;
    pendingComponent?: Assert extends undefined ? (props: NoInfer<Props>) => ReactNode : undefined;
    component: (props: Props) => any;
}) => ((props: Props) => ReactNode) & {
    useOidc: () => undefined extends Assert
        ? CreateOidcComponent.Oidc<DecodedIdToken>
        : "user logged in" extends Assert
        ? CreateOidcComponent.Oidc.LoggedIn<DecodedIdToken>
        : CreateOidcComponent.Oidc.NotLoggedIn;
};

export namespace CreateOidcComponent {
    export type WithAutoLogin<DecodedIdToken> = <Props>(params: {
        pendingComponent?: (params: NoInfer<Props>) => ReactNode;
        component: (props: Props) => ReactNode;
    }) => ((props: Props) => ReactNode) & {
        useOidc: () => Oidc.LoggedIn<DecodedIdToken>;
    };

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
        type Common = {
            issuerUri: string;
            clientId: string;
        };

        export type NotLoggedIn = Common & {
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

        export type LoggedIn<DecodedIdToken> = Common & {
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
              getDecodedIdToken?: never;
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
        };

        export type NotLoggedIn = Common & {
            isUserLoggedIn: false;
            initializationError: OidcInitializationError | undefined;
            login: Oidc_core.NotLoggedIn["login"];
        };

        export type LoggedIn<DecodedIdToken> = Common & {
            isUserLoggedIn: true;
            getAccessToken: () => Promise<string>;
            getDecodedIdToken: () => DecodedIdToken;
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

export type OidcFnMiddleware<AccessTokenClaims> = {
    (params?: {
        assert?: undefined;
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): OidcFnMiddleware.TanStackFnMiddleware<{
        oidc: OidcServerContext<AccessTokenClaims>;
    }>;
    (params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): OidcFnMiddleware.TanStackFnMiddleware<{
        oidc: OidcServerContext.LoggedIn<AccessTokenClaims>;
    }>;
};

export namespace OidcFnMiddleware {
    export type WithAutoLogin<AccessTokenClaims> = (params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }) => TanStackFnMiddleware<{
        oidc: OidcServerContext.LoggedIn<AccessTokenClaims>;
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

export type OidcServerContext<AccessTokenClaims> =
    | OidcServerContext.LoggedIn<AccessTokenClaims>
    | (OidcServerContext.NotLoggedIn & {
          accessTokenClaims?: never;
          accessToken?: never;
      });

export namespace OidcServerContext {
    export type NotLoggedIn = {
        isUserLoggedIn: false;
    };

    export type LoggedIn<AccessTokenClaims> = {
        isUserLoggedIn: true;
        accessTokenClaims: AccessTokenClaims;
        accessToken: string;
    };
}

export type OidcRequestMiddleware<AccessTokenClaims> = {
    (params?: {
        assert?: undefined;
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): OidcRequestMiddleware.TanstackRequestMiddleware<{
        oidc: OidcServerContext<AccessTokenClaims>;
    }>;
    (params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): OidcRequestMiddleware.TanstackRequestMiddleware<{
        oidc: OidcServerContext.LoggedIn<AccessTokenClaims>;
    }>;
};

export namespace OidcRequestMiddleware {
    export type WithAutoLogin<AccessTokenClaims> = (params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }) => TanstackRequestMiddleware<{
        oidc: OidcServerContext.LoggedIn<AccessTokenClaims>;
    }>;

    export type TanstackRequestMiddleware<T> = RequestMiddlewareAfterServer<{}, undefined, T>;
}

export type ParamsOfBootstrap<AutoLogin, DecodedIdToken, AccessTokenClaims> =
    | ParamsOfBootstrap.Real<AutoLogin>
    | ParamsOfBootstrap.Mock<AutoLogin, DecodedIdToken, AccessTokenClaims>;

export namespace ParamsOfBootstrap {
    export type Real<AutoLogin> = {
        implementation: "real";

        /**
         * See: https://docs.oidc-spa.dev/v/v8/providers-configuration/provider-configuration
         */
        issuerUri: string;
        /**
         * See: https://docs.oidc-spa.dev/v/v8/providers-configuration/provider-configuration
         */
        clientId: string;

        /**
         * Default: 45 second.
         * It defines how long before the auto logout we should start
         * displaying an overlay message to the user alerting them
         * like: "Are you still there? You'll be disconnected in 45...44..."
         * NOTE: This parameter is only UI related! It does not defines
         * after how much time of inactivity the user should be auto logged out.
         * This is a server policy (that can be overwrote by idleSessionLifetimeInSeconds)
         * See: https://docs.oidc-spa.dev/v/v8/auto-logout
         */
        startCountdownSecondsBeforeAutoLogout?: number;
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
    } & (AutoLogin extends true ? {} : {});

    export type Mock<AutoLogin, DecodedIdToken, AccessTokenClaims> = {
        implementation: "mock";
        issuerUri_mock?: string;
        clientId_mock?: string;
        decodedIdToken_mock?: DecodedIdToken;
    } & (AccessTokenClaims extends undefined
        ? {}
        : {
              accessTokenClaims_mock?: AccessTokenClaims;
          }) &
        (AutoLogin extends true
            ? {
                  isUserInitiallyLoggedIn?: true;
              }
            : {
                  isUserInitiallyLoggedIn: boolean;
              });
}

export type OidcSpaApi<AutoLogin, DecodedIdToken, AccessTokenClaims> = {
    bootstrapOidc: (
        params: GetterOrDirectValue<
            { process: { env: Record<string, string> } },
            ParamsOfBootstrap<AutoLogin, DecodedIdToken, AccessTokenClaims>
        >
    ) => void;
    createOidcComponent: AutoLogin extends true
        ? CreateOidcComponent.WithAutoLogin<DecodedIdToken>
        : CreateOidcComponent<DecodedIdToken>;
    getOidc: AutoLogin extends true ? GetOidc.WithAutoLogin<DecodedIdToken> : GetOidc<DecodedIdToken>;
} & (AccessTokenClaims extends undefined
    ? {}
    : {
          oidcFnMiddleware: AutoLogin extends true
              ? OidcFnMiddleware.WithAutoLogin<AccessTokenClaims>
              : OidcFnMiddleware<AccessTokenClaims>;
          oidcRequestMiddleware: AutoLogin extends true
              ? OidcRequestMiddleware.WithAutoLogin<AccessTokenClaims>
              : OidcRequestMiddleware<AccessTokenClaims>;
      }) &
    (AutoLogin extends true
        ? {
              OidcInitializationGate: (props: {
                  renderFallback: (props: {
                      initializationError: OidcInitializationError | undefined;
                  }) => ReactNode;
                  children: ReactNode;
              }) => ReactNode;
          }
        : {
              enforceLogin: (loaderContext: {
                  cause: "preload" | string;
                  location: {
                      href: string;
                  };
              }) => Promise<void | never>;
          });

export type CreateValidateAndGetAccessTokenClaims<AccessTokenClaims> = (params: {
    paramsOfBootstrap: ParamsOfBootstrap<boolean, Record<string, unknown>, AccessTokenClaims>;
}) => {
    validateAndGetAccessTokenClaims: (params: { accessToken: string }) => Promise<
        | {
              isValid: true;
              accessTokenClaims: AccessTokenClaims;
          }
        | {
              isValid: false;
              errorMessage: string;
              wwwAuthenticateHeaderErrorDescription: string;
          }
    >;
};
