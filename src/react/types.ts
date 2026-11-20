import type { ReactNode, ComponentType } from "react";
import type {
    OidcInitializationError,
    ParamsOfCreateOidc,
    IdTokenClaims,
    OidcProviderMetadata,
    OidcUserInfo,
    Oidc,
    OidcTokens,
    AutoLogoutState
} from "../core";
import type { MaybeAsync } from "../tools/MaybeAsync";
import { assert, type Equals } from "../tools/tsafe/assert";

export type { IdTokenClaims, OidcProviderMetadata, OidcUserInfo, OidcTokens, Oidc, AutoLogoutState };

export type UseOidc<User> = {
    (params?: { assert?: undefined }): Oidc_react<User>;
    (params: { assert: "user logged in" }): Oidc_react.LoggedIn<User>;
    (params: { assert: "user not logged in" }): Oidc_react.NotLoggedIn;
};

export type Oidc_react<User> =
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
          suspensePromise?: never;
      })
    | (Oidc_react.LoggedIn<User> & {
          login?: never;
          initializationError?: never;
          suspensePromise?: never;
      });

export namespace Oidc_react {
    export type NotReady = {
        isOidcReady: false;
        suspensePromise: Promise<void | never>;
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

    export type LoggedIn<User> = {
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
        autoLogoutState: AutoLogoutState;
        user: User;
        refreshUser: () => Promise<void>;
    };
}

export type GetOidc<User> = {
    (params?: { assert?: undefined }): Promise<Oidc<User>>;
    (params: { assert: "user logged in" }): Promise<Oidc.LoggedIn<User>>;
    (params: { assert: "user not logged in" }): Promise<Oidc.NotLoggedIn>;
};

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
            isNonInteractive: boolean;
        }) => string;
        authorizationParams?:
            | Record<string, string | string[] | undefined>
            | ((params: { isNonInteractive: boolean }) => Record<string, string | string[] | undefined>);
        tokenParams?: Record<string, string | string[] | undefined>;
        sessionRestorationMethod?: "iframe" | "foreground redirect" | "auto";
        __oidcProviderMetadata?: OidcProviderMetadata;
        autoLogout_returnToUrl?: ParamsOfCreateOidc<unknown>["autoLogout_returnToUrl"];
        disableDPoP?: true;
    };

    assert<Equals<Omit<Real, "mode">, Omit<ParamsOfCreateOidc<unknown>, "createUser">>>;

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

export type OidcSpaUtils<User> = {
    useOidc: UseOidc<User>;
    getOidc: GetOidc<User>;
    enforceLogin: (loaderContext: LoaderContext) => Promise<void | never>;
    withLoginEnforced: <Props extends Record<string, unknown>>(params: {
        component: ComponentType<Props>;
        errorComponent?: ComponentType<{ oidcInitializationError: OidcInitializationError }>;
        pendingComponent?: ComponentType;
    }) => (props: Props) => ReactNode;
};

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
            url: string;
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
