import type { Signal, EnvironmentProviders } from "@angular/core";
import type { HttpInterceptorFn, HttpRequest } from "@angular/common/http";
import type { CanActivateFn } from "@angular/router";
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
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";
import { assert, type Equals } from "../tools/tsafe/assert";

export type { IdTokenClaims, OidcProviderMetadata, OidcUserInfo, OidcTokens, Oidc_client };

export type InjectOidc<User> = {
    (params?: { assert?: undefined }): Oidc_angular<User>;
    (params: { assert: "user logged in" }): Oidc_angular.LoggedIn<User>;
    (params: { assert: "user not logged in" }): Oidc_angular.NotLoggedIn;
};

export namespace InjectOidc {
    export type WithAutoLogin<User> = () => Oidc_angular.LoggedIn<User>;
}

export type Oidc_angular<User> =
    | (Oidc_angular.NotLoggedIn & {
          logout?: never;
          renewTokens?: never;
          startAuthorization?: never;
          authorizationResult?: never;
          isNewBrowserSession?: never;
          user?: never;
          refreshUser?: never;
      })
    | (Oidc_angular.LoggedIn<User> & {
          login?: never;
          initializationError?: never;
      });

export namespace Oidc_angular {
    export type NotLoggedIn = {
        isUserLoggedIn: false;
        issuerUri: string;
        clientId: string;
        validRedirectUri: string;
        /** Remains pending during SSR. Gate auth UI with @defer (when oidc.prInitialized | async). */
        prInitialized: Promise<true>;
        login: (params: {
            returnToUrl?: string;
            authorizationParams?: Record<string, string | string[] | undefined>;
            transformAuthorizationUrl?: (params: { authorizationUrl: string }) => string;
            doesCurrentHrefEnforceLogin?: boolean;
        }) => Promise<never>;
        autoLogoutState: Signal<{
            shouldDisplayWarning: false;
        }>;
        initializationError: OidcInitializationError | undefined;
    };

    export type LoggedIn<User> = {
        isUserLoggedIn: true;
        issuerUri: string;
        clientId: string;
        validRedirectUri: string;
        /** Remains pending during SSR. Gate auth UI with @defer (when oidc.prInitialized | async). */
        prInitialized: Promise<true>;
        logout: Oidc_client.LoggedIn["logout"];
        renewTokens: Oidc_client.LoggedIn["renewTokens"];
        startAuthorization: Oidc_client.LoggedIn["startAuthorization"];
        authorizationResult: Oidc_client.LoggedIn["authorizationResult"];
        isNewBrowserSession: boolean;
        autoLogoutState: Signal<
            Parameters<Parameters<Oidc_client.LoggedIn["subscribeToAutoLogoutState"]>[0]>[0]
        >;
        user: Signal<User>;
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
            isNonInteractive: boolean;
        }) => string;
        authorizationParams?:
            | Record<string, string | string[] | undefined>
            | ((params: { isNonInteractive: boolean }) => Record<string, string | string[] | undefined>);
        tokenParams?: Record<string, string | string[] | undefined>;
        sessionRestorationMethod?: "iframe" | "foreground redirect" | "auto";
        __oidcProviderMetadata?: OidcProviderMetadata;
        autoLogout_returnToUrl?: ParamsOfCreateOidc<unknown, boolean>["autoLogout_returnToUrl"];
        disableDPoP?: true;
    };

    assert<
        Equals<
            Omit<Real, "mode">,
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
    provideOidc: (
        getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>
    ) => EnvironmentProviders;
    /** Can be injected during SSR; auth state must only be read after prInitialized resolves. */
    injectOidc: AutoLogin extends true ? InjectOidc.WithAutoLogin<User> : InjectOidc<User>;
    getOidc: AutoLogin extends true ? GetOidc.WithAutoLogin<User> : GetOidc<User>;
    createOidcInterceptor: (params: {
        /**
         * May inject services. Return false before reading auth state for requests that load
         * runtime configuration. Pending auth reads are retried once core is ready.
         * Requests made by createUser must not depend on the user being constructed.
         */
        shouldInjectAccessToken: (req: HttpRequest<unknown>) => boolean;
    }) => HttpInterceptorFn;
} & (AutoLogin extends true
    ? {
          /**
           * Angular's equivalent of OidcInitializationErrorGate. Read the signal inside
           * @defer (when oidc.prInitialized | async), before rendering authenticated UI.
           */
          injectOidcInitializationError: () => Signal<OidcInitializationError | undefined>;
      }
    : {
          /** Protected routes must use RenderMode.Client in app.routes.server.ts. */
          enforceLoginGuard: (
              route: Parameters<CanActivateFn>[0],
              state?: Parameters<CanActivateFn>[1]
          ) => Promise<true>;
      });

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
