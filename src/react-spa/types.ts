import type { ReactNode, ComponentType } from "react";
import type {
    OidcInitializationError,
    ParamsOfCreateOidc,
    IdTokenClaims,
    OidcProviderMetadata,
    OidcUserInfo,
    Oidc as Oidc_client,
    OidcTokens
} from "../core";
import type { MaybeAsync } from "../tools/MaybeAsync";
import { assert, type Equals } from "../tools/tsafe/assert";

export type { IdTokenClaims, OidcProviderMetadata, OidcUserInfo, OidcTokens, Oidc_client };

export type UseOidc<User> = {
    (params?: { assert?: undefined }): Oidc_react<User>;
    (params: { assert: "user logged in" }): Oidc_react.LoggedIn<User>;
    (params: { assert: "user not logged in" }): Oidc_react.NotLoggedIn;
};

export namespace UseOidc {
    export type WithAutoLogin<User> = () => Oidc_react.LoggedIn<User>;
}

export type Oidc_react<User> =
    | (Oidc_react.NotLoggedIn & {
          logout?: never;
          renewTokens?: never;
          startAuthorization?: never;
          authorizationResult?: never;
          isNewBrowserSession?: never;
          user?: never;
          refreshUser?: never;
      })
    | (Oidc_react.LoggedIn<User> & {
          login?: never;
          initializationError?: never;
      });

export namespace Oidc_react {
    export type NotLoggedIn = {
        isUserLoggedIn: false;
        issuerUri: string;
        clientId: string;
        validRedirectUri: string;
        login: (params: {
            returnToUrl?: string;
            authorizationParams?: Record<string, string | string[] | undefined>;
            transformAuthorizationUrl?: (params: { authorizationUrl: string }) => string;
            doesCurrentHrefEnforceLogin?: boolean;
        }) => Promise<never>;
        autoLogoutState: {
            shouldDisplayWarning: false;
        };
        initializationError: OidcInitializationError | undefined;
    };

    export type LoggedIn<User> = {
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
        user: User;
        refreshUser: () => Promise<void>;
    };
}

export type GetOidc<User> = {
    (params?: { assert?: undefined }): Promise<Oidc_client<User>>;
    (params: { assert: "user logged in" }): Promise<Oidc_client.LoggedIn<User>>;
    (params: { assert: "user not logged in" }): Promise<Oidc_client.NotLoggedIn>;
};

export namespace GetOidc {
    export type WithAutoLogin<User> = (params?: {
        assert: "user logged in";
    }) => Promise<Oidc_client.LoggedIn<User>>;
}

export type RuntimeConfigs = RuntimeConfigs.Real | RuntimeConfigs.Mock;

export namespace RuntimeConfigs {
    export type Real = {
        mode: "real";
        issuerUri: string;
        debugLogs?: boolean;
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
            | ((params: { isSilentRedirect: boolean }) => Record<string, string | string[] | undefined>);
        tokenParams?: Record<string, string | string[] | undefined>;
        sessionRestorationMethod?: "iframe" | "full page redirect" | "auto";
        __oidcProviderMetadata?: OidcProviderMetadata;
        autoLogout_returnToUrl?: ParamsOfCreateOidc<unknown, boolean>["autoLogout_returnToUrl"];
        disableDPoP?: true;
    };

    assert<
        Equals<
            Real,
            Omit<
                ParamsOfCreateOidc<unknown, boolean>,
                "createUser" | "autoLogin" | "autoLogin_returnToUrl"
            >
        >
    >;

    export type Mock = {
        mode: "mock";
        issuerUri_mock?: string;
        accessToken_mock?: string;
        clientId_mock?: string;
        idTokenClaims_mock?: IdTokenClaims;
        refreshToken_mock?: string;
        idToken_mock?: string;
        isUserInitiallyLoggedIn?: boolean;
    };
}

export type OidcSpaUtils<User, AutoLogin> = {
    useOidc: AutoLogin extends true ? UseOidc.WithAutoLogin<User> : UseOidc<User>;
    getOidc: AutoLogin extends true ? GetOidc.WithAutoLogin<User> : GetOidc<User>;
    OidcInitializationGate: (props: { fallback?: ReactNode; children: ReactNode }) => ReactNode;
} & (AutoLogin extends true
    ? {
          OidcInitializationErrorGate: (props: {
              errorComponent: ComponentType<{
                  initializationError: OidcInitializationError;
              }>;
              children: ReactNode;
          }) => ReactNode;
      }
    : {
          enforceLogin: (loaderContext: LoaderContext) => Promise<void | never>;
          withLoginEnforced: <Props extends Record<string, unknown>>(
              component: ComponentType<Props>
          ) => (props: Props) => ReactNode;
      });

export type LoaderContext = LoaderContext.TanStackRouterLike | LoaderContext.ReactRouterLike;

export namespace LoaderContext {
    export type TanStackRouterLike = {
        cause: "preload" | string;
        location: {
            href: string;
        };
    };

    export type ReactRouterLike = {
        request: {
            href: string;
        };
    };
}

export type CreateClientUser<User> = (params: {
    isMock: boolean;
    idTokenClaims: IdTokenClaims;
    accessToken: string;
    fetchUserInfo: () => Promise<OidcUserInfo>;
    issuerUri: string;
    clientId: string;
    validRedirectUri: string;
    user_current: User | undefined;
}) => MaybeAsync<User>;
