import { useEffect, useState, createContext, useContext, useReducer, type ReactNode } from "react";
import { createOidc, type ParamsOfCreateOidc, type Oidc } from "../oidc";
import { OidcInitializationError } from "../OidcInitializationError";
import { assert } from "../vendor/frontend/tsafe";
import { id } from "../vendor/frontend/tsafe";
import { useGuaranteedMemo } from "../tools/powerhooks/useGuaranteedMemo";
import type { PromiseOrNot } from "../tools/PromiseOrNot";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";
import { Deferred } from "../tools/Deferred";

export type OidcReact<DecodedIdToken extends Record<string, unknown>> =
    | OidcReact.NotLoggedIn
    | OidcReact.LoggedIn<DecodedIdToken>;

export namespace OidcReact {
    export type Common = Oidc.Common;

    export type NotLoggedIn = Common & {
        isUserLoggedIn: false;
        login: Oidc.NotLoggedIn["login"];
        initializationError: OidcInitializationError | undefined;

        oidcTokens?: never;
        logout?: never;
        subscribeToAutoLogoutCountdown?: never;
        goToAuthServer?: never;
    };

    export type LoggedIn<DecodedIdToken extends Record<string, unknown>> = Common & {
        isUserLoggedIn: true;
        oidcTokens: Oidc.Tokens<DecodedIdToken>;
        logout: Oidc.LoggedIn["logout"];
        renewTokens: Oidc.LoggedIn["renewTokens"];
        subscribeToAutoLogoutCountdown: (
            tickCallback: (params: { secondsLeft: number | undefined }) => void
        ) => { unsubscribeFromAutoLogoutCountdown: () => void };

        login?: never;
        initializationError?: never;
        goToAuthServer: (params: {
            extraQueryParams?: Record<string, string>;
            redirectUrl?: string;
            transformUrlBeforeRedirect?: (url: string) => string;
        }) => Promise<never>;
    } & (
            | {
                  /**
                   * "back from auth server":
                   *      The user was redirected to the authentication server login/registration page and then redirected back to the application.
                   * "session storage":
                   *    The user's authentication was restored from the browser session storage, typically after a page refresh.
                   * "silent signin":
                   *   The user was authenticated silently using an iframe to check the session with the authentication server.
                   */
                  authMethod: "back from auth server";
                  /**
                   * Defined when authMethod is "back from auth server".
                   * If you called `goToAuthServer` or `login` with extraQueryParams, this object let you know the outcome of the
                   * of the action that was intended.
                   *
                   * For example, on a Keycloak server, if you called `goToAuthServer({ extraQueryParams: { kc_action: "UPDATE_PASSWORD" } })`
                   * you'll get back: `{ extraQueryParams: { kc_action: "UPDATE_PASSWORD" }, result: { kc_action_status: "success" } }` (or "cancelled")
                   */
                  backFromAuthServer: {
                      extraQueryParams: Record<string, string>;
                      result: Record<string, string>;
                  };
              }
            | {
                  authMethod: "session storage" | "silent signin";
                  backFromAuthServer?: never;
              }
        );
}

const oidcContext = createContext<
    | {
          oidc: Oidc;
          decodedIdTokenSchema: { parse: (data: unknown) => Record<string, unknown> } | undefined;
      }
    | undefined
>(undefined);

type OidcReactApi<
    DecodedIdToken extends Record<string, unknown>,
    IsAuthGloballyRequired extends boolean
> = {
    OidcProvider: IsAuthGloballyRequired extends true
        ? (props: {
              fallback?: ReactNode;
              ErrorFallback?: (props: { initializationError: OidcInitializationError }) => ReactNode;
              children: ReactNode;
          }) => JSX.Element
        : (props: { fallback?: ReactNode; children: ReactNode }) => JSX.Element;
    useOidc: IsAuthGloballyRequired extends true
        ? {
              (params?: { assertUserLoggedIn: true }): OidcReact.LoggedIn<DecodedIdToken>;
          }
        : {
              (params?: { assertUserLoggedIn: false }): OidcReact<DecodedIdToken>;
              (params: { assertUserLoggedIn: true }): OidcReact.LoggedIn<DecodedIdToken>;
          };
    /** @deprecated: Use getOidc instead */
    prOidc: Promise<
        IsAuthGloballyRequired extends true ? Oidc.LoggedIn<DecodedIdToken> : Oidc<DecodedIdToken>
    >;
    getOidc: () => Promise<
        IsAuthGloballyRequired extends true ? Oidc.LoggedIn<DecodedIdToken> : Oidc<DecodedIdToken>
    >;
};

export function createOidcReactApi_dependencyInjection<
    DecodedIdToken extends Record<string, unknown>,
    ParamsOfCreateOidc extends {
        isAuthGloballyRequired?: boolean;
    } & (
        | {
              decodedIdTokenSchema: { parse: (data: unknown) => DecodedIdToken } | undefined;
          }
        | {}
    )
>(
    paramsOrGetParams: ValueOrAsyncGetter<ParamsOfCreateOidc>,
    createOidc: (params: ParamsOfCreateOidc) => PromiseOrNot<Oidc<DecodedIdToken>>
): OidcReactApi<
    DecodedIdToken,
    ParamsOfCreateOidc extends { isAuthGloballyRequired?: true | undefined } ? true : false
> {
    const dReadyToCreate = new Deferred<void>();

    let decodedIdTokenSchema: { parse: (data: unknown) => DecodedIdToken } | undefined = undefined;

    // NOTE: It can be InitializationError only if isAuthGloballyRequired is true
    const prOidcOrInitializationError = (async () => {
        const params = await (async () => {
            if (typeof paramsOrGetParams === "function") {
                const getParams = paramsOrGetParams;

                await dReadyToCreate.pr;

                const params = await getParams();

                return params;
            }

            const params = paramsOrGetParams;

            return params;
        })();

        if ("decodedIdTokenSchema" in params) {
            decodedIdTokenSchema = params.decodedIdTokenSchema;
        }

        let oidc;

        try {
            oidc = await createOidc(params);
        } catch (error) {
            assert(error instanceof OidcInitializationError);

            return error;
        }

        return oidc;
    })();

    function OidcProvider(props: {
        fallback?: ReactNode;
        ErrorFallback?: (props: { initializationError: OidcInitializationError }) => ReactNode;
        children: ReactNode;
    }) {
        const { fallback, ErrorFallback, children } = props;

        const [oidcOrInitializationError, setOidcOrInitializationError] = useState<
            Oidc | OidcInitializationError | undefined
        >(undefined);

        useEffect(() => {
            dReadyToCreate.resolve();
            prOidcOrInitializationError.then(setOidcOrInitializationError);
        }, []);

        if (oidcOrInitializationError === undefined) {
            return <>{fallback === undefined ? null : fallback}</>;
        }

        if (oidcOrInitializationError instanceof OidcInitializationError) {
            const initializationError = oidcOrInitializationError;

            return (
                <>
                    {ErrorFallback === undefined ? (
                        <h1 style={{ "color": "red" }}>
                            An error occurred while initializing the OIDC client:&nbsp;
                            {initializationError.message}
                        </h1>
                    ) : (
                        <ErrorFallback initializationError={initializationError} />
                    )}
                </>
            );
        }

        return (
            <oidcContext.Provider value={{ oidc: oidcOrInitializationError, decodedIdTokenSchema }}>
                {children}
            </oidcContext.Provider>
        );
    }

    function useOidc(params?: { assertUserLoggedIn: false }): OidcReact<DecodedIdToken>;
    function useOidc(params: { assertUserLoggedIn: true }): OidcReact.LoggedIn<DecodedIdToken>;
    function useOidc(params?: { assertUserLoggedIn: boolean }): OidcReact<DecodedIdToken> {
        const { assertUserLoggedIn = false } = params ?? {};

        const { oidc, decodedIdTokenSchema: decodedIdTokenSchema_context } = (function useClosure() {
            const context = useContext(oidcContext);

            assert(context !== undefined, "You must use useOidc inside a OidcProvider");

            return context;
        })();

        const [, forceUpdate] = useReducer(() => [], []);

        useEffect(() => {
            if (!oidc.isUserLoggedIn) {
                return;
            }

            const { unsubscribe } = oidc.subscribeToTokensChange(forceUpdate);

            return unsubscribe;
        }, [oidc]);

        if (assertUserLoggedIn && !oidc.isUserLoggedIn) {
            throw new Error(
                "The user must be logged in to use this hook (assertUserLoggedIn was set to true)"
            );
        }

        const { oidcTokens } = (function useClosure() {
            const tokens = oidc.isUserLoggedIn ? oidc.getTokens() : undefined;

            const oidcTokens = useGuaranteedMemo(() => {
                if (tokens === undefined) {
                    return undefined;
                }

                const oidcTokens: Oidc.Tokens<DecodedIdToken> = {
                    "accessToken": tokens.accessToken,
                    "accessTokenExpirationTime": tokens.accessTokenExpirationTime,
                    "idToken": tokens.idToken,
                    "refreshToken": tokens.refreshToken,
                    "refreshTokenExpirationTime": tokens.refreshTokenExpirationTime,
                    "decodedIdToken": null as any
                };

                let cache: { decodedIdToken: Record<string, unknown> } | undefined = undefined;

                Object.defineProperty(oidcTokens, "decodedIdToken", {
                    "get": () => {
                        if (cache !== undefined) {
                            return cache.decodedIdToken;
                        }

                        let { decodedIdToken } = tokens;

                        if (
                            decodedIdTokenSchema !== undefined &&
                            decodedIdTokenSchema !== decodedIdTokenSchema_context
                        ) {
                            decodedIdToken = decodedIdTokenSchema.parse(decodedIdToken);
                        }

                        cache = { decodedIdToken };

                        return decodedIdToken;
                    }
                });

                return oidcTokens;
            }, [
                tokens?.accessToken,
                tokens?.accessTokenExpirationTime,
                tokens?.idToken,
                tokens?.refreshToken,
                tokens?.refreshTokenExpirationTime
            ]);

            return { oidcTokens };
        })();

        const common: OidcReact.Common = {
            "params": oidc.params
        };

        return oidc.isUserLoggedIn
            ? id<OidcReact.LoggedIn<DecodedIdToken>>(
                  (assert(oidcTokens !== undefined),
                  {
                      ...common,
                      "isUserLoggedIn": true,
                      oidcTokens,
                      "logout": oidc.logout,
                      "renewTokens": oidc.renewTokens,
                      "subscribeToAutoLogoutCountdown": oidc.subscribeToAutoLogoutCountdown,
                      "goToAuthServer": oidc.goToAuthServer,
                      ...(oidc.authMethod === "back from auth server"
                          ? {
                                "authMethod": "back from auth server",
                                "backFromAuthServer": oidc.backFromAuthServer
                            }
                          : {
                                "authMethod": oidc.authMethod
                            })
                  })
              )
            : id<OidcReact.NotLoggedIn>({
                  ...common,
                  "isUserLoggedIn": false,
                  "login": oidc.login,
                  "initializationError": oidc.initializationError
              });
    }

    const prOidc = prOidcOrInitializationError.then(oidcOrInitializationError => {
        if (oidcOrInitializationError instanceof OidcInitializationError) {
            return new Promise<never>(() => {});
        }

        const oidc = oidcOrInitializationError;

        return oidc;
    });

    return {
        OidcProvider,
        // @ts-expect-error: We know what we are doing
        useOidc,
        // @ts-expect-error: We know what we are doing
        prOidc,
        // @ts-expect-error: We know what we are doing
        getOidc: () => {
            dReadyToCreate.resolve();
            return prOidc;
        }
    };
}

/** @see: https://docs.oidc-spa.dev/v/v4/documentation/usage#react-api */
export function createReactOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    IsAuthGloballyRequired extends boolean = false
>(params: ValueOrAsyncGetter<ParamsOfCreateOidc<DecodedIdToken, IsAuthGloballyRequired>>) {
    return createOidcReactApi_dependencyInjection(params, createOidc);
}
