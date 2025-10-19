import type { ReactNode } from "react";
import type { Oidc as Oidc_core, OidcInitializationError } from "../../core";
import type { FunctionMiddlewareAfterServer, RequestMiddlewareAfterServer } from "@tanstack/react-start";
import type { GetterOrDirectValue } from "../../tools/GetterOrDirectValue";

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
        hasRequiredClaims: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): OidcRequestMiddleware.TanstackRequestMiddleware<{
        oidc: OidcServerContext<AccessTokenClaims>;
    }>;
    (params?: {
        assert?: "user logged in";
        hasRequiredClaims: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): OidcRequestMiddleware.TanstackRequestMiddleware<{
        oidc: OidcServerContext.LoggedIn<AccessTokenClaims>;
    }>;
};

export namespace OidcRequestMiddleware {
    export type WithAutoLogin<AccessTokenClaims> = (params?: {
        assert?: "user logged in";
        hasRequiredClaims: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
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
