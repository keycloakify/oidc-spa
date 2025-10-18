import type { ReactNode } from "react";
import type { Oidc as Oidc_core, OidcInitializationError } from "../../core";
import type { FunctionMiddlewareAfterServer, RequestMiddlewareAfterServer } from "@tanstack/react-start";
import type { GetterOrDirectValue } from "../../tools/GetterOrDirectValue";

export type CreateOidcComponent<DecodedIdToken> = {
    <Props>(params: {
        assert?: undefined;
        pendingComponent?: (props: NoInfer<Props>) => ReactNode;
        component: (props: Props) => ReactNode;
    }): ((props: Props) => ReactNode) & {
        useOidc: () => CreateOidcComponent.Oidc<DecodedIdToken>;
    };
    <Props>(params: { assert: "user logged in"; component: (props: Props) => ReactNode }): ((
        props: Props
    ) => ReactNode) & {
        useOidc: () => CreateOidcComponent.Oidc.LoggedIn<DecodedIdToken>;
    };
    <Props>(params: { assert: "user not logged in"; component: (props: Props) => ReactNode }): ((
        props: Props
    ) => ReactNode) & {
        useOidc: () => CreateOidcComponent.Oidc.NotLoggedIn;
    };
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

export type GetOidcFnMiddleware<AccessTokenClaims> = {
    (params?: {
        assert?: undefined;
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): GetOidcFnMiddleware.TanStackFnMiddleware<{
        oidcContext: OidcServerContext<AccessTokenClaims>;
    }>;
    (params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): GetOidcFnMiddleware.TanStackFnMiddleware<{
        oidcContext: OidcServerContext.LoggedIn<AccessTokenClaims>;
    }>;
};

export namespace GetOidcFnMiddleware {
    export type WithAutoLogin<AccessTokenClaims> = (params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }) => TanStackFnMiddleware<{
        oidcContext: OidcServerContext.LoggedIn<AccessTokenClaims>;
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

export type GetOidcRequestMiddleware<AccessTokenClaims> = {
    (params?: {
        assert?: undefined;
        hasRequiredClaims: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): GetOidcRequestMiddleware.TanstackRequestMiddleware<{
        oidcContext: OidcServerContext<AccessTokenClaims>;
    }>;
    (params?: {
        assert?: "user logged in";
        hasRequiredClaims: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }): GetOidcRequestMiddleware.TanstackRequestMiddleware<{
        oidcContext: OidcServerContext.LoggedIn<AccessTokenClaims>;
    }>;
};

export namespace GetOidcRequestMiddleware {
    export type WithAutoLogin<AccessTokenClaims> = (params?: {
        assert?: "user logged in";
        hasRequiredClaims: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }) => TanstackRequestMiddleware<{
        oidcContext: OidcServerContext.LoggedIn<AccessTokenClaims>;
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
