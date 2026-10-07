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
          startAuthorization?: never;
          authorizationResult?: never;
          isNewBrowserSession?: never;

          login?: never;
          user?: never;
          refreshUser?: never;
      })
    | (Oidc_react.NotLoggedIn & {
          logout?: never;
          renewTokens?: never;
          startAuthorization?: never;
          authorizationResult?: never;
          isNewBrowserSession?: never;
          user?: never;
          refreshUser?: never;
      })
    | (Oidc_react.LoggedIn<User_client> & {
          login?: never;
          initializationError?: never;
      });

export namespace Oidc_react {
    export type NotReady = {
        isOidcReady: false;
        autoLogoutState: {
            shouldDisplayWarning: false;
        };
        initializationError: OidcInitializationError | undefined;
    };

    export type NotLoggedIn = {
        isOidcReady: true;
        isUserLoggedIn: false;
        issuerUri: string;
        clientId: string;
        validRedirectUri: string;
        login: (params: {
            returnToUrl?: string;
            authorizationParams?: Record<string, string | string[] | undefined>;
            transformAuthorizationUrl?: (params: { authorizationUrl: string }) => string;
        }) => Promise<never>;
        autoLogoutState: {
            shouldDisplayWarning: false;
        };
        initializationError: OidcInitializationError | undefined;
    };

    export type LoggedIn<User_client> = {
        isOidcReady: true;
        isUserLoggedIn: true;
        issuerUri: string;
        clientId: string;
        validRedirectUri: string;
        logout: Oidc_client.LoggedIn["logout"];
        renewTokens: Oidc_client.LoggedIn["renewTokens"];
        startAuthorization: Oidc_client.LoggedIn["startAuthorization"];
        authorizationResult: Oidc_client.LoggedIn["authorizationResult"];
        isNewBrowserSession: boolean;
        autoLogoutState: Parameters<
            Parameters<Oidc_client.LoggedIn["subscribeToAutoLogoutState"]>[0]
        >[0];
        user: User_client;
        refreshUser: () => Promise<void>;
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

export type RuntimeConfigs<User_server> =
    | RuntimeConfigs.Real<User_server extends undefined ? false : true>
    | RuntimeConfigs.Mock<User_server extends undefined ? false : true>;

export namespace RuntimeConfigs {
    export type Real<HasServer> = {
        mode: "real";
        issuerUri: string;
        debugLogs?: boolean;
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
            autoLogout_returnToUrl?: ParamsOfCreateOidc<unknown, boolean>["autoLogout_returnToUrl"];
            disableDPoP?: true;
        };
    } & (HasServer extends true
        ? {
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
          }
        : {});

    assert<
        Equals<
            Real<false>["client"] & Pick<Real<false>, "issuerUri" | "debugLogs">,
            Omit<
                ParamsOfCreateOidc<unknown, boolean>,
                "createUser" | "autoLogin" | "autoLogin_returnToUrl"
            >
        >
    >;

    export type Mock<HasServer> = {
        mode: "mock";
        issuerUri_mock?: string;
        accessToken_mock?: string;
        client?: {
            clientId_mock?: string;
            idTokenClaims_mock?: IdTokenClaims;
            refreshToken_mock?: string;
            idToken_mock?: string;
            isUserInitiallyLoggedIn?: boolean;
        };
    } & (HasServer extends true
        ? {
              server?: {
                  accessTokenClaims_mock?: AccessTokenClaims;
              };
          }
        : {});
}

export type OidcSpaUtils<User_client, User_server, AutoLogin> = {
    useOidc: AutoLogin extends true ? UseOidc.WithAutoLogin<User_client> : UseOidc<User_client>;
    getOidc: AutoLogin extends true ? GetOidc.WithAutoLogin<User_client> : GetOidc<User_client>;
} & (AutoLogin extends true
    ? {}
    : {
          enforceLogin: (loaderContext: TanStackRouterLoaderContextLike) => Promise<void | never>;
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

export type TanStackRouterLoaderContextLike = {
    cause: "preload" | string;
    location: {
        href: string;
    };
};

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
