import { useEffect, useState, createContext, useContext, useReducer, type ReactNode } from "react";
import { createOidc, type ParamsOfCreateOidc, type Oidc } from "./oidc";
import { assert } from "tsafe/assert";
import { id } from "tsafe/id";
import { useGuaranteedMemo } from "./tools/powerhooks/useGuaranteedMemo";

export type OidcReact<DecodedIdToken extends Record<string, unknown>> =
    | OidcReact.NotLoggedIn
    | OidcReact.LoggedIn<DecodedIdToken>;

export namespace OidcReact {
    export type Common = Oidc.Common;

    export type NotLoggedIn = Common & {
        isUserLoggedIn: false;
        login: Oidc.NotLoggedIn["login"];
        oidcTokens?: never;
        logout?: never;
    };

    export type LoggedIn<DecodedIdToken extends Record<string, unknown>> = Common & {
        isUserLoggedIn: true;
        oidcTokens: Oidc.Tokens<DecodedIdToken>;
        logout: Oidc.LoggedIn["logout"];
        renewTokens: Oidc.LoggedIn["renewTokens"];
        login?: never;
    };
}

const oidcContext = createContext<
    | {
          oidc: Oidc;
          decodedIdTokenSchema: ParamsOfCreateOidc["decodedIdTokenSchema"];
      }
    | undefined
>(undefined);

/** @see: https://github.com/garronej/oidc-spa#option-2-usage-directly-within-react */
export function createReactOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>
>(params: ParamsOfCreateOidc<DecodedIdToken>) {
    const prOidc = createOidc(params);

    const { decodedIdTokenSchema } = params;

    function OidcProvider(props: { fallback?: ReactNode; children: ReactNode }) {
        const { children, fallback } = props;

        const [oidc, setOidc] = useState<Oidc | undefined>(undefined);

        useEffect(() => {
            prOidc.then(setOidc);
        }, []);

        if (oidc === undefined) {
            return <>{fallback === undefined ? null : fallback}</>;
        }

        return (
            <oidcContext.Provider value={{ oidc, decodedIdTokenSchema }}>
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
                      "renewTokens": oidc.renewTokens
                  })
              )
            : id<OidcReact.NotLoggedIn>({
                  ...common,
                  "isUserLoggedIn": false,
                  "login": oidc.login
              });
    }

    return { OidcProvider, useOidc, prOidc };
}
