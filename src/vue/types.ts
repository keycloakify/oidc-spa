import type { ComputedRef, ShallowRef } from "vue";
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

/** Unasserted calls expose a reactive snapshot and destructurable refs for its fields. */
export type UseOidc<User> = {
    (params?: { assert?: undefined }): Oidc_vue.Ref<User>;
    (params: { assert: "user logged in" }): Oidc_vue.LoggedIn<User>;
    (params: { assert: "user not logged in" }): Oidc_vue.NotLoggedIn;
};

export type Oidc_vue<User> =
    | (Oidc_vue.NotReady & {
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
    | (Oidc_vue.NotLoggedIn & {
          logout?: never;
          renewTokens?: never;
          startAuthorization?: never;
          authorizationResult?: never;
          isNewBrowserSession?: never;
          user?: never;
          refreshUser?: never;
      })
    | (Oidc_vue.LoggedIn<User> & {
          login?: never;
          initializationError?: never;
      });

export namespace Oidc_vue {
    export type Ref<User> = ComputedRef<Oidc_vue<User>> & {
        readonly [Key in keyof Oidc_vue<unknown>]-?: ComputedRef<
            Key extends "user"
                ? User | undefined
                : Key extends "autoLogoutState"
                ? AutoLogoutState
                : Oidc_vue<User>[Key]
        >;
    };

    export type NotReady = {
        isOidcReady: false;
        autoLogoutState: Readonly<ShallowRef<{ shouldDisplayWarning: false }>>;
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
        autoLogoutState: Readonly<ShallowRef<{ shouldDisplayWarning: false }>>;
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
        autoLogoutState: Readonly<ShallowRef<AutoLogoutState>>;
        user: Readonly<ShallowRef<User>>;
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
    enforceLogin: (to: RouteLocationNormalizedGenericLike) => Promise<void | never>;
};

export type RouteLocationNormalizedGenericLike = {
    fullPath: string;
};

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
