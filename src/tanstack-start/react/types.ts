import type {
    OidcInitializationError,
    ParamsOfCreateOidc,
    IdTokenClaims,
    OidcProviderMetadata,
    OidcUserInfo,
    Oidc,
    OidcTokens
} from "../../core";
import type { FunctionMiddlewareAfterServer, RequestMiddlewareAfterServer } from "@tanstack/react-start";
import type { MaybeAsync } from "../../tools/MaybeAsync";
import { assert, type Equals } from "../../tools/tsafe/assert";
import type { AccessTokenClaims_specs as AccessTokenClaims } from "../../server";

export type { IdTokenClaims, OidcProviderMetadata, OidcUserInfo, OidcTokens, Oidc };
export type { AccessTokenClaims };

export type UseOidc<User_client> = {
    (params?: { assert?: undefined }): Oidc_react<User_client>;
    (params: { assert: "user logged in" }): Oidc_react.LoggedIn<User_client>;
    (params: { assert: "user not logged in" }): Oidc_react.NotLoggedIn;
};

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
        login: (params?: {
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
        logout: Oidc.LoggedIn["logout"];
        renewTokens: Oidc.LoggedIn["renewTokens"];
        startAuthorization: Oidc.LoggedIn["startAuthorization"];
        authorizationResult: Oidc.LoggedIn["authorizationResult"];
        isNewBrowserSession: boolean;
        autoLogoutState: Parameters<Parameters<Oidc.LoggedIn["subscribeToAutoLogoutState"]>[0]>[0];
        user: User_client;
        refreshUser: () => Promise<void>;
    };
}

export type GetOidc<User_client> = {
    (params?: { assert?: undefined }): Promise<Oidc<User_client>>;
    (params: { assert: "user logged in" }): Promise<Oidc.LoggedIn<User_client>>;
    (params: { assert: "user not logged in" }): Promise<Oidc.NotLoggedIn>;
};

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
                isNonInteractive: boolean;
            }) => string;
            authorizationParams?:
                | Record<string, string | string[] | undefined>
                | ((params: {
                      isNonInteractive: boolean;
                  }) => Record<string, string | string[] | undefined>);
            tokenParams?: Record<string, string | string[] | undefined>;
            sessionRestorationMethod?: "iframe" | "foreground redirect" | "auto";
            __oidcProviderMetadata?: OidcProviderMetadata;
            autoLogout_returnToUrl?: ParamsOfCreateOidc<unknown>["autoLogout_returnToUrl"];
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
            Omit<ParamsOfCreateOidc<unknown>, "createUser">
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

export type OidcSpaUtils<User_client, User_server> = {
    useOidc: UseOidc<User_client>;
    getOidc: GetOidc<User_client>;
    enforceLogin: (loaderContext: TanStackRouterLoaderContextLike) => Promise<void | never>;
} & (User_server extends undefined
    ? {}
    : {
          oidcFnMiddleware: OidcFnMiddleware<User_server>;
          oidcRequestMiddleware: OidcRequestMiddleware<User_server>;
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
