import { useEffect, useState, createContext, useContext, useReducer, type ReactNode } from "react";
import type { JSX } from "../tools/JSX";
import { type Oidc, createOidc, type ParamsOfCreateOidc, OidcInitializationError } from "../oidc";
import { assert, type Equals } from "../vendor/frontend/tsafe";
import { id } from "../vendor/frontend/tsafe";
import { useGuaranteedMemo } from "../tools/powerhooks/useGuaranteedMemo";
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
        backFromAuthServer?: never;
        isNewBrowserSession?: never;
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

        backFromAuthServer:
            | {
                  extraQueryParams: Record<string, string>;
                  result: Record<string, string>;
              }
            | undefined;

        isNewBrowserSession: boolean;
    };
}

const oidcContext = createContext<
    | {
          oidc: Oidc;
          decodedIdTokenSchema: { parse: (data: unknown) => Record<string, unknown> } | undefined;
      }
    | undefined
>(undefined);

type OidcReactApi<DecodedIdToken extends Record<string, unknown>, AutoLogin extends boolean> = {
    OidcProvider: AutoLogin extends true
        ? (props: {
              fallback?: ReactNode;
              ErrorFallback?: (props: { initializationError: OidcInitializationError }) => ReactNode;
              children: ReactNode;
          }) => JSX.Element
        : (props: { fallback?: ReactNode; children: ReactNode }) => JSX.Element;
    useOidc: AutoLogin extends true
        ? {
              (params?: { assert: "user logged in" }): OidcReact.LoggedIn<DecodedIdToken>;
          }
        : {
              (params?: { assert?: undefined }): OidcReact<DecodedIdToken>;
              (params: { assert: "user logged in" }): OidcReact.LoggedIn<DecodedIdToken>;
              (params: { assert: "user not logged in" }): OidcReact.NotLoggedIn;
          };
    getOidc: () => Promise<
        AutoLogin extends true ? Oidc.LoggedIn<DecodedIdToken> : Oidc<DecodedIdToken>
    >;
};

export function createOidcReactApi_dependencyInjection<
    DecodedIdToken extends Record<string, unknown>,
    ParamsOfCreateOidc extends {
        autoLogin?: boolean;
    } & (
        | {
              decodedIdTokenSchema: { parse: (data: unknown) => DecodedIdToken } | undefined;
          }
        | {}
    )
>(
    paramsOrGetParams: ValueOrAsyncGetter<ParamsOfCreateOidc>,
    createOidc: (params: ParamsOfCreateOidc) => Promise<Oidc<DecodedIdToken>>
): OidcReactApi<
    DecodedIdToken,
    ParamsOfCreateOidc extends { autoLogin?: true | undefined } ? true : false
> {
    const dReadyToCreate = new Deferred<void>();

    let decodedIdTokenSchema: { parse: (data: unknown) => DecodedIdToken } | undefined = undefined;

    // NOTE: It can be InitializationError only if autoLogin is true
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
            if (!(error instanceof OidcInitializationError)) {
                throw error;
            }

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
                        <h1 style={{ color: "red" }}>
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

    function useOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): OidcReact<DecodedIdToken> {
        const { assert: assert_params } = params ?? {};

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

        check_assertion: {
            if (assert_params === undefined) {
                break check_assertion;
            }

            const getMessage = (v: string) =>
                [
                    "There is a logic error in the application.",
                    `If this component is mounted the user is supposed ${v}.`,
                    "An explicit assertion was made in this sense."
                ].join(" ");

            switch (assert_params) {
                case "user logged in":
                    if (!oidc.isUserLoggedIn) {
                        throw new Error(getMessage("to be logged in but currently they arn't"));
                    }
                    break;
                case "user not logged in":
                    if (oidc.isUserLoggedIn) {
                        throw new Error(getMessage("not to be logged in but currently they are"));
                    }
                    break;
                default:
                    assert<Equals<typeof assert_params, never>>(false);
            }
        }

        const { oidcTokens } = (function useClosure() {
            const tokens = oidc.isUserLoggedIn ? oidc.getTokens() : undefined;

            const oidcTokens = useGuaranteedMemo(() => {
                if (tokens === undefined) {
                    return undefined;
                }

                const oidcTokens: Oidc.Tokens<DecodedIdToken> = {
                    accessToken: tokens.accessToken,
                    accessTokenExpirationTime: tokens.accessTokenExpirationTime,
                    idToken: tokens.idToken,
                    refreshToken: tokens.refreshToken,
                    refreshTokenExpirationTime: tokens.refreshTokenExpirationTime,
                    decodedIdToken: null as any
                };

                let cache: { decodedIdToken: Record<string, unknown> } | undefined = undefined;

                Object.defineProperty(oidcTokens, "decodedIdToken", {
                    get: () => {
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
            params: oidc.params
        };

        return oidc.isUserLoggedIn
            ? id<OidcReact.LoggedIn<DecodedIdToken>>(
                  (assert(oidcTokens !== undefined),
                  {
                      ...common,
                      isUserLoggedIn: true,
                      oidcTokens,
                      logout: oidc.logout,
                      renewTokens: oidc.renewTokens,
                      subscribeToAutoLogoutCountdown: oidc.subscribeToAutoLogoutCountdown,
                      goToAuthServer: oidc.goToAuthServer,
                      isNewBrowserSession: oidc.isNewBrowserSession,
                      backFromAuthServer: oidc.backFromAuthServer
                  })
              )
            : id<OidcReact.NotLoggedIn>({
                  ...common,
                  isUserLoggedIn: false,
                  login: oidc.login,
                  initializationError: oidc.initializationError
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
        getOidc: () => {
            dReadyToCreate.resolve();
            return prOidc;
        }
    };
}

/** @see: https://docs.oidc-spa.dev/v/v6/usage#react-api */
export function createReactOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    AutoLogin extends boolean = false
>(params: ValueOrAsyncGetter<ParamsOfCreateOidc<DecodedIdToken, AutoLogin>>) {
    return createOidcReactApi_dependencyInjection(params, createOidc);
}
