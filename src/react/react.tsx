import {
    useEffect,
    useState,
    createContext,
    useContext,
    useReducer,
    useRef,
    type ReactNode
} from "react";
import type { JSX } from "../tools/JSX";
import { type Oidc, createOidc, type ParamsOfCreateOidc, OidcInitializationError } from "../oidc";
import { assert, type Equals } from "../vendor/frontend/tsafe";
import { id } from "../vendor/frontend/tsafe";
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

        /** @deprecated: Use `const { decodedIdToken, tokens} = useOidc();` */
        oidcTokens?: never;
        decodedIdToken?: never;
        tokens?: never;
        logout?: never;
        subscribeToAutoLogoutCountdown?: never;
        goToAuthServer?: never;
        backFromAuthServer?: never;
        isNewBrowserSession?: never;
    };

    export type LoggedIn<DecodedIdToken extends Record<string, unknown>> = Common & {
        isUserLoggedIn: true;
        /** @deprecated: Use `const { decodedIdToken, tokens} = useOidc();` */
        oidcTokens: Oidc.Tokens<DecodedIdToken>;
        decodedIdToken: DecodedIdToken;
        tokens: Oidc.Tokens<DecodedIdToken> | undefined;
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

    const oidcContext = createContext<Oidc<DecodedIdToken> | undefined>(undefined);

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

        let oidc: Oidc<DecodedIdToken>;

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
            Oidc<DecodedIdToken> | OidcInitializationError | undefined
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

        const oidc = oidcOrInitializationError;

        return <oidcContext.Provider value={oidc}>{children}</oidcContext.Provider>;
    }

    function useOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): OidcReact<DecodedIdToken> {
        const { assert: assert_params } = params ?? {};

        const oidc = useContext(oidcContext);

        assert(oidc !== undefined, "You must use useOidc inside the corresponding OidcProvider");

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

        const [, forceUpdate] = useReducer(() => [], []);
        // TODO: Remove in next major version
        useEffect(() => {
            if (!oidc.isUserLoggedIn) {
                return;
            }

            const { unsubscribe } = oidc.subscribeToTokensChange(forceUpdate);

            return unsubscribe;
        }, [oidc]);

        const refTokensState = useRef<{
            isConsumerReadingTokens: boolean;
            tokens: Oidc.Tokens<DecodedIdToken> | undefined;
        }>({
            isConsumerReadingTokens: false,
            tokens: undefined
        });

        const tokensPropertyDescriptorGetter = () => {
            const tokenState = refTokensState.current;
            tokenState.isConsumerReadingTokens = true;
            return tokenState.tokens;
        };

        useEffect(() => {
            if (!oidc.isUserLoggedIn) {
                return;
            }

            const updateTokens = (tokens: Oidc.Tokens<DecodedIdToken>) => {
                if (tokens === refTokensState.current.tokens) {
                    return;
                }

                const tokenState = refTokensState.current;

                tokenState.tokens = tokens;

                if (tokenState.isConsumerReadingTokens) {
                    forceUpdate();
                }
            };

            let isActive = true;

            oidc.getTokens_next().then(tokens => {
                if (!isActive) {
                    return;
                }
                updateTokens(tokens);
            });

            const { unsubscribe } = oidc.subscribeToTokensChange(tokens => {
                updateTokens(tokens);
            });

            return () => {
                isActive = false;
                unsubscribe();
            };
        }, []);

        const common: OidcReact.Common = {
            params: oidc.params
        };

        if (!oidc.isUserLoggedIn) {
            return id<OidcReact.NotLoggedIn>({
                ...common,
                isUserLoggedIn: false,
                login: oidc.login,
                initializationError: oidc.initializationError
            });
        }

        const oidcReact: OidcReact.LoggedIn<DecodedIdToken> = {
            ...common,
            isUserLoggedIn: true,
            oidcTokens: oidc.getTokens(),
            decodedIdToken: oidc.getDecodedIdToken(),
            tokens: null as any,
            logout: oidc.logout,
            renewTokens: oidc.renewTokens,
            subscribeToAutoLogoutCountdown: oidc.subscribeToAutoLogoutCountdown,
            goToAuthServer: oidc.goToAuthServer,
            isNewBrowserSession: oidc.isNewBrowserSession,
            backFromAuthServer: oidc.backFromAuthServer
        };

        Object.defineProperty(oidcReact, "tokens", {
            get: tokensPropertyDescriptorGetter,
            enumerable: true,
            configurable: true
        });

        return oidcReact;
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
        getOidc: async () => {
            dReadyToCreate.resolve();

            // TODO: Directly return oidc in next major version
            const oidc = await prOidc;

            if (oidc.isUserLoggedIn) {
                await oidc.getTokens_next();
            }

            return oidc;
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
