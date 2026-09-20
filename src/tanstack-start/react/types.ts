import type {
    OidcInitializationError,
    ParamsOfCreateOidc,
    IdTokenClaims,
    OidcProviderMetadata,
    OidcUserInfo,
    Oidc as Oidc_client,
    OidcTokens
} from "../../core";
import type { FunctionMiddlewareAfterServer, RequestMiddlewareAfterServer } from "@tanstack/react-start";
import type { GetterOrDirectValue } from "../../tools/GetterOrDirectValue";
import type { MaybeAsync } from "../../tools/MaybeAsync";
import { assert, type Equals } from "../../tools/tsafe/assert";
import type { AccessTokenClaims_specs as AccessTokenClaims } from "../../server";

export type { IdTokenClaims, OidcProviderMetadata, OidcUserInfo, OidcTokens, Oidc_client };
export type { AccessTokenClaims };

export type UseOidc<User_client> = {
    (params?: { assert?: undefined }): Oidc_react<User_client>;
    (params: { assert: "user logged in" }): Oidc_react.LoggedIn<User_client>;
    (params: { assert: "user not logged in" }): Oidc_react.NotLoggedIn;
};

export namespace UseOidc {
    export type WithAutoLogin<User_client> = (params?: {
        assert: "ready";
    }) => Oidc_react.LoggedIn<User_client>;
}

export type Oidc_react<User_client> =
    | (Oidc_react.NotReady & {
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
    | (Oidc_react.NotLoggedIn & {
          logout?: never;
          renewTokens?: never;
          goToAuthServer?: never;
          backFromAuthServer?: never;
          isNewBrowserSession?: never;
          user?: never;
          refreshUser?: never;
      })
    | (Oidc_react.LoggedIn<User_client> & {
          login?: never;
          oidcInitializationError?: never;
      });

export namespace Oidc_react {
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
            params: { redirectTo: "home" | "current page" } | { redirectTo: "specific url"; url: string }
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

export type GetOidc<User_client> = {
    (params?: { assert?: undefined }): Promise<Oidc_client<User_client>>;
    (params: { assert: "user logged in" }): Promise<Oidc_client.LoggedIn<User_client>>;
    (params: { assert: "user not logged in" }): Promise<Oidc_client.NotLoggedIn>;
};

export namespace GetOidc {
    export type WithAutoLogin<User_client> = (params?: {
        assert: "user logged in";
    }) => Promise<Oidc_client.LoggedIn<User_client>>;
}

export type OidcFnMiddleware<User_server> = {
    (params?: {
        require?: undefined;
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }): OidcFnMiddleware.TanStackFnMiddleware<{
        oidc: Oidc_server<User_server>;
    }>;
    (params?: {
        require?: "authed request";
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }): OidcFnMiddleware.TanStackFnMiddleware<{
        oidc: Oidc_server.LoggedIn<User_server>;
    }>;
};

export namespace OidcFnMiddleware {
    export type WithAutoLogin<User_server> = (params?: {
        require?: "authed request";
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }) => TanStackFnMiddleware<{
        oidc: Oidc_server.LoggedIn<User_server>;
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

export type Oidc_server<User_server> =
    | Oidc_server.LoggedIn<User_server>
    | (Oidc_server.NotLoggedIn & {
          user?: never;
          accessToken?: never;
      });

export namespace Oidc_server {
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
        oidc: Oidc_server<User_server>;
    }>;
    (params?: {
        require?: "authed request";
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }): OidcRequestMiddleware.TanstackRequestMiddleware<{
        oidc: Oidc_server.LoggedIn<User_server>;
    }>;
};

export namespace OidcRequestMiddleware {
    export type WithAutoLogin<User_server> = (params?: {
        require?: "authed request";
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }) => TanstackRequestMiddleware<{
        oidc: Oidc_server.LoggedIn<User_server>;
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
