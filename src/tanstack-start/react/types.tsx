import type { ReactNode } from "react";
import type {} from "@tanstack/react-start";
import type { Oidc as Oidc_core, OidcInitializationError } from "../../core";
import type { FunctionMiddlewareAfterServer, RequestMiddlewareAfterServer } from "@tanstack/react-start";

export type Oidc<DecodedIdToken> = Oidc.NotLoggedIn | Oidc.LoggedIn<DecodedIdToken>;

export namespace Oidc {
    export type Common = Oidc_core.Common & {
        params: {
            issuerUri: string;
            clientId: string;
        };
        autoLogoutState:
            | {
                  shouldDisplayWarning: true;
                  secondsLeftBeforeAutoLogout: number;
              }
            | {
                  shouldDisplayWarning: false;
              };
    };

    export type NotLoggedIn = Common & {
        // NOTE: Undefined is when oidc is still initializing, we don't know yet if the user
        // is logged in or not.
        isUserLoggedIn: false | undefined;
        login: (params?: {
            extraQueryParams?: Record<string, string | undefined>;
            redirectUrl?: string;
            transformUrlBeforeRedirect?: (url: string) => string;
        }) => Promise<never>;
        initializationError: OidcInitializationError | undefined;

        decodedIdToken?: never;
        logout?: never;
        renewTokens?: never;
        goToAuthServer?: never;
        backFromAuthServer?: never;
        isNewBrowserSession?: never;
    };

    export type LoggedIn<DecodedIdToken> = Common & {
        isUserLoggedIn: true;
        decodedIdToken: DecodedIdToken;
        logout: Oidc_core.LoggedIn["logout"];
        renewTokens: Oidc_core.LoggedIn["renewTokens"];
        goToAuthServer: (params: {
            extraQueryParams?: Record<string, string>;
            redirectUrl?: string;
            transformUrlBeforeRedirect?: (url: string) => string;
        }) => Promise<never>;
        backFromAuthServer:
            | {
                  extraQueryParams: Record<string, string>;
                  result: Record<string, string>;
              }
            | undefined;
        isNewBrowserSession: boolean;

        login?: never;
        initializationError?: never;
    };
}

export type UseOidc<DecodedIdToken> = {
    (params?: { assert?: undefined }): Oidc<DecodedIdToken>;
    (params: { assert: "user logged in" }): Oidc.LoggedIn<DecodedIdToken>;
    (params: { assert: "user not logged in" }): Oidc.NotLoggedIn;
};
export namespace UseOidc {
    export type WithAutoLogin<DecodedIdToken> = (params?: {
        assert: "user logged in";
    }) => Oidc.LoggedIn<DecodedIdToken>;
}

export type GetOidcAccessToken = {
    (params?: { assert?: undefined }): Oidc<
        | {
              isUserLoggedIn: true;
              accessToken: string;
          }
        | {
              isUserLoggedIn: false;
              accessToken?: never;
          }
    >;
    (params: { assert: "user logged in" }): Promise<{
        isUserLoggedIn: true;
        accessToken: string;
    }>;
};

export namespace GetOidcAccessToken {
    export type WithAutoLogin = (params?: { assert?: "user logged in" }) => Promise<{
        isUserLoggedIn: true;
        accessToken: string;
    }>;
}

export type GetOidcFnMiddleware<AccessTokenClaims> = {
    (params?: {
        assert?: undefined;
        hasRequiredClaims: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): GetOidcFnMiddleware.TanStackFnMiddleware<{
        oidcContext: OidcContext<AccessTokenClaims>;
    }>;
    (params?: {
        assert?: "user logged in";
        hasRequiredClaims: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): GetOidcFnMiddleware.TanStackFnMiddleware<{
        oidcContext: OidcContext.LoggedIn<AccessTokenClaims>;
    }>;
};

export namespace GetOidcFnMiddleware {
    export type WithAutoLogin<AccessTokenClaims> = (params?: {
        assert?: "user logged in";
        hasRequiredClaims: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }) => TanStackFnMiddleware<{
        oidcContext: OidcContext.LoggedIn<AccessTokenClaims>;
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

export type OidcContext<AccessTokenClaims> =
    | OidcContext.LoggedIn<AccessTokenClaims>
    | OidcContext.NotLoggedIn;

export namespace OidcContext {
    export type NotLoggedIn = {
        isUserLoggedIn: false;
        accessTokenClaims?: never;
        accessToken?: never;
    };

    export type LoggedIn<AccessTokenClaims> = {
        isUserLoggedIn: true;
        accessTokenClaims: AccessTokenClaims;
        accessToken: string;
    };
}

export type GetOidcRequestMiddleware<AccessTokenClaims> = {
    (params?: {
        assert?: undefined;
        hasRequiredClaims: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): GetOidcRequestMiddleware.TanstackRequestMiddleware<{
        oidcContext: OidcContext<AccessTokenClaims>;
    }>;
    (params?: {
        assert?: "user logged in";
        hasRequiredClaims: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): GetOidcRequestMiddleware.TanstackRequestMiddleware<{
        oidcContext: OidcContext.LoggedIn<AccessTokenClaims>;
    }>;
};

export namespace GetOidcRequestMiddleware {
    export type WithAutoLogin<AccessTokenClaims> = (params?: {
        assert?: "user logged in";
        hasRequiredClaims: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }) => TanstackRequestMiddleware<{
        oidcContext: OidcContext.LoggedIn<AccessTokenClaims>;
    }>;

    export type TanstackRequestMiddleware<T> = RequestMiddlewareAfterServer<{}, undefined, T>;
}

export type ParamsOfBootstrap<AutoLogin, DecodedIdToken, AccessTokenClaims> =
    | ParamsOfBootstrap.Real<AutoLogin>
    | ParamsOfBootstrap.Mock<AutoLogin, DecodedIdToken, AccessTokenClaims>;

export namespace ParamsOfBootstrap {
    export type Real<AutoLogin> = {
        implementation: "real";
        issuerUri: string;
        clientId: string;
        startCountdownSecondsBeforeAutoLogout?: number;
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
    bootstrapOidc: (params: ParamsOfBootstrap<AutoLogin, DecodedIdToken, AccessTokenClaims>) => void;
    useOidc: AutoLogin extends true ? UseOidc.WithAutoLogin<DecodedIdToken> : UseOidc<DecodedIdToken>;
    getOidcAccessToken: AutoLogin extends true ? GetOidcAccessToken.WithAutoLogin : GetOidcAccessToken;
} & (AccessTokenClaims extends undefined
    ? {}
    : {
          getOidcFnMiddleware: AutoLogin extends true
              ? GetOidcFnMiddleware.WithAutoLogin<AccessTokenClaims>
              : GetOidcFnMiddleware<AccessTokenClaims>;
          getOidcRequestMiddleware: AutoLogin extends true
              ? GetOidcRequestMiddleware.WithAutoLogin<AccessTokenClaims>
              : GetOidcRequestMiddleware<AccessTokenClaims>;
      }) &
    (AutoLogin extends true
        ? {
              OidcInitializationGate: (props: {
                  renderFallback: (props: { error: OidcInitializationError | undefined }) => ReactNode;
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
