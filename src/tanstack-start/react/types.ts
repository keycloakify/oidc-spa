import type {
    OidcInitializationError,
    ParamsOfCreateOidc,
    IdTokenClaims,
    OidcProviderMetadata,
    OidcUserInfo,
    OidcTokens
} from "../../core";
import type { FunctionMiddlewareAfterServer, RequestMiddlewareAfterServer } from "@tanstack/react-start";
import type { GetterOrDirectValue } from "../../tools/GetterOrDirectValue";
import type { MaybeAsync } from "../../tools/MaybeAsync";
import { assert, type Equals } from "../../tools/tsafe/assert";
import type { AccessTokenClaims_specs as AccessTokenClaims } from "../../server";

export type { IdTokenClaims, AccessTokenClaims, OidcProviderMetadata, OidcUserInfo, OidcTokens };

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
            logout: (
                params:
                    | { redirectTo: "home" | "current page" }
                    | { redirectTo: "specific url"; url: string }
            ) => Promise<never>;
            renewTokens: () => Promise<void>;
            goToAuthServer: (params: {
                authorizationParams?: Record<string, string | string[] | undefined>;
                transformAuthorizationUrl?: (params: { authorizationUrl: string }) => string;
                redirectUrl?: string;
            }) => Promise<never>;
            backFromAuthServer:
                | {
                      authorizationParams: Record<string, string | string[]>;
                      result: Record<string, string>;
                  }
                | undefined;
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
              subscribeToTokensChange?: never;
              getTokens?: never;
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
            login: (params?: {
                doesCurrentHrefRequiresAuth?: boolean;
                redirectUrl?: string;
                authorizationParams?: Record<string, string | string[] | undefined>;
                transformAuthorizationUrl?: (params: { authorizationUrl: string }) => string;
            }) => Promise<never>;
        };

        export type LoggedIn<User_client> = Common & {
            isUserLoggedIn: true;
            renewTokens(): Promise<void>;
            subscribeToTokensChange: (onTokenChange: (tokens: OidcTokens) => void) => {
                unsubscribeFromTokensChange: () => void;
            };
            getTokens: (param?: ParamsOfGetToken) => Promise<OidcTokens>;
            getAccessToken: (params?: ParamsOfGetToken) => Promise<string>;
            logout: (
                params:
                    | { redirectTo: "home" | "current page" }
                    | { redirectTo: "specific url"; url: string }
            ) => Promise<never>;
            goToAuthServer: (params: {
                authorizationParams?: Record<string, string | string[] | undefined>;
                transformAuthorizationUrl?: (params: { authorizationUrl: string }) => string;
                redirectUrl?: string;
            }) => Promise<never>;
            backFromAuthServer:
                | {
                      authorizationParams: Record<string, string | string[]>;
                      result: Record<string, string>;
                  }
                | undefined;
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

        export type ParamsOfGetToken = {
            authorizationParams?: Record<string, string | string[] | undefined>;
            tokenParams?: Record<string, string | string[] | undefined>;
            scope?: string[];
            redirectUrl?: string;
            disableDPoP?: boolean;
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
            clientId: string;
            warnUserSecondsBeforeAutoLogout?: number;
            idleSessionLifetimeInSeconds?: number;
            scopes?: string[];
            transformAuthorizationUrl?: (params: {
                authorizationUrl: string;
                isSilentRedirect: boolean;
            }) => string;
            authorizationParams?:
                | Record<string, string | string[] | undefined>
                | ((params: {
                      isSilentRedirect: boolean;
                  }) => Record<string, string | string[] | undefined>);
            tokenParams?: Record<string, string | string[] | undefined>;
            sessionRestorationMethod?: "iframe" | "full page redirect" | "auto";
            __oidcProviderMetadata?: OidcProviderMetadata;
            autoLogout_redirectionTarget?:
                | {
                      redirectTo: "home" | "current page";
                  }
                | {
                      redirectTo: "specific url";
                      url: string;
                  };
            disableDPoP?: true;
        };
    };

    assert<
        Equals<
            Real["client"] & Pick<Real, "issuerUri" | "debugLogs">,
            Omit<
                ParamsOfCreateOidc<unknown, boolean>,
                "createUser" | "autoLogin" | "autoLogin_redirectUrl"
            >
        >
    >;

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
            refreshToken_mock?: string;
            idTokenMock?: string;
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
