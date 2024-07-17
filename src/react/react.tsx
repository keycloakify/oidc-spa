import { useEffect, useState, createContext, useContext, useReducer, type ReactNode } from "react";
import { createOidc, type ParamsOfCreateOidc, type Oidc, OidcInitializationError } from "../oidc";
import { assert } from "tsafe/assert";
import { id } from "tsafe/id";
import { useGuaranteedMemo } from "../tools/powerhooks/useGuaranteedMemo";
import type { PromiseOrNot } from "../tools/PromiseOrNot";

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
    };
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
    IsAuthRequiredOnEveryPages extends boolean
> = {
    // TODO: Error fallback when auth required on every pages.
    OidcProvider: IsAuthRequiredOnEveryPages extends true
        ? (props: { fallback?: ReactNode; children: ReactNode }) => JSX.Element
        : (props: {
              fallback?: ReactNode;
              ErrorFallback?: (props: { initializationError: OidcInitializationError }) => ReactNode;
              children: ReactNode;
          }) => JSX.Element;
    useOidc: IsAuthRequiredOnEveryPages extends true
        ? {
              (params?: { assertUserLoggedIn: true }): OidcReact.LoggedIn<DecodedIdToken>;
          }
        : {
              (params?: { assertUserLoggedIn: false }): OidcReact<DecodedIdToken>;
              (params: { assertUserLoggedIn: true }): OidcReact<DecodedIdToken>;
          };
    prOidc: Promise<
        IsAuthRequiredOnEveryPages extends true ? Oidc.LoggedIn<DecodedIdToken> : Oidc<DecodedIdToken>
    >;
};

export function createOidcReactApi_dependencyInjection<
    DecodedIdToken extends Record<string, unknown>,
    ParamsOfCreateOidc extends {
        isAuthRequiredOnEveryPages?: boolean;
    } & (
        | {
              decodedIdTokenSchema: { parse: (data: unknown) => DecodedIdToken } | undefined;
          }
        | {}
    )
>(
    params: ParamsOfCreateOidc,
    createOidc: (params: ParamsOfCreateOidc) => PromiseOrNot<Oidc<DecodedIdToken>>
): OidcReactApi<
    DecodedIdToken,
    ParamsOfCreateOidc extends { isAuthRequiredOnEveryPages: boolean }
        ? ParamsOfCreateOidc["isAuthRequiredOnEveryPages"]
        : false
> {
    const prOidc = Promise.resolve(createOidc(params)).catch(error => {
        if (!(error instanceof OidcInitializationError)) {
            throw error;
        }

        return error;
    });

    const { decodedIdTokenSchema } =
        "decodedIdTokenSchema" in params ? params : { "decodedIdTokenSchema": undefined };

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
            prOidc.then(setOidcOrInitializationError);
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
                            {" "}
                            An error occurred while initializing the OIDC client:{" "}
                            {initializationError.message}{" "}
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
                      "subscribeToAutoLogoutCountdown": oidc.subscribeToAutoLogoutCountdown
                  })
              )
            : id<OidcReact.NotLoggedIn>({
                  ...common,
                  "isUserLoggedIn": false,
                  "login": oidc.login,
                  "initializationError": oidc.initializationError
              });
    }

    return {
        OidcProvider,
        // @ts-expect-error: We know what we are doing
        useOidc,
        // @ts-expect-error: We know what we are doing
        prOidc
    };
}

/** @see: https://docs.oidc-spa.dev/documentation/usage#react-api */
export function createReactOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    IsAuthRequiredOnEveryPages extends boolean = false
>(params: ParamsOfCreateOidc<DecodedIdToken, IsAuthRequiredOnEveryPages>) {
    return createOidcReactApi_dependencyInjection(params, createOidc);
}
