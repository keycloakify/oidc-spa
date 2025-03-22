import {
    useEffect,
    useState,
    createContext,
    useContext,
    useReducer,
    useRef,
    type ReactNode,
    type ComponentType,
    type FC,
    JSX
} from "react";
import { type Oidc, createOidc, type ParamsOfCreateOidc, OidcInitializationError } from "../core";
import { assert, type Equals, type Param0 } from "../vendor/frontend/tsafe";
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
        login: (params?: {
            extraQueryParams?: Record<string, string | undefined>;
            redirectUrl?: string;
            transformUrlBeforeRedirect?: (url: string) => string;
            doesCurrentHrefRequiresAuth?: boolean;
        }) => Promise<never>;
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
{
    type Actual = Param0<OidcReact.NotLoggedIn["login"]>;
    type Expected = Omit<Param0<Oidc.NotLoggedIn["login"]>, "doesCurrentHrefRequiresAuth"> & {
        doesCurrentHrefRequiresAuth?: boolean;
    };

    assert<Equals<Actual, Expected>>();
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
} & (AutoLogin extends true
    ? {}
    : {
          withLoginEnforced: <Props extends Record<string, unknown>>(
              Component: ComponentType<Props>,
              params?: {
                  onRedirecting: () => JSX.Element | null;
              }
          ) => FC<Props>;
          enforceLogin: (redirectUrl?: string) => Promise<void | never>;
      });

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

    const oidcContext = createContext<{ oidc: Oidc<DecodedIdToken>; fallback: ReactNode } | undefined>(
        undefined
    );

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

        return (
            <oidcContext.Provider value={{ oidc, fallback: fallback ?? null }}>
                {children}
            </oidcContext.Provider>
        );
    }

    function useOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): OidcReact<DecodedIdToken> {
        const { assert: assert_params } = params ?? {};

        const contextValue = useContext(oidcContext);

        assert(contextValue !== undefined, "You must use useOidc inside the corresponding OidcProvider");

        const { oidc } = contextValue;

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

        const tokensState_ref = useRef<{
            isConsumerReadingTokens: boolean;
            tokens: Oidc.Tokens<DecodedIdToken> | undefined;
        }>({
            isConsumerReadingTokens: false,
            tokens: undefined
        });

        useEffect(() => {
            if (!oidc.isUserLoggedIn) {
                return;
            }

            const updateTokens = (tokens: Oidc.Tokens<DecodedIdToken>) => {
                if (tokens === tokensState_ref.current.tokens) {
                    return;
                }

                const tokenState = tokensState_ref.current;

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
                login: ({ doesCurrentHrefRequiresAuth = false, ...rest } = {}) =>
                    oidc.login({ doesCurrentHrefRequiresAuth, ...rest }),
                initializationError: oidc.initializationError
            });
        }

        const oidcReact: OidcReact.LoggedIn<DecodedIdToken> = {
            ...common,
            isUserLoggedIn: true,
            oidcTokens: oidc.getTokens(),
            decodedIdToken: oidc.getDecodedIdToken(),
            get tokens() {
                const tokensState = tokensState_ref.current;
                tokensState.isConsumerReadingTokens = true;
                return tokensState.tokens;
            },
            logout: oidc.logout,
            renewTokens: oidc.renewTokens,
            subscribeToAutoLogoutCountdown: oidc.subscribeToAutoLogoutCountdown,
            goToAuthServer: oidc.goToAuthServer,
            isNewBrowserSession: oidc.isNewBrowserSession,
            backFromAuthServer: oidc.backFromAuthServer
        };

        return oidcReact;
    }

    function withLoginEnforced<Props extends Record<string, unknown>>(
        Component: ComponentType<Props>,
        params?: {
            onRedirecting?: () => JSX.Element | null;
        }
    ): FC<Props> {
        const { onRedirecting } = params ?? {};

        function ComponentWithLoginEnforced(props: Props) {
            const contextValue = useContext(oidcContext);

            assert(contextValue !== undefined);

            const { oidc, fallback } = contextValue;

            useEffect(() => {
                if (oidc.isUserLoggedIn) {
                    return;
                }

                oidc.login({ doesCurrentHrefRequiresAuth: true });
            }, []);

            if (!oidc.isUserLoggedIn) {
                return onRedirecting === undefined ? fallback : onRedirecting();
            }

            return <Component {...props} />;
        }

        ComponentWithLoginEnforced.displayName = `${
            Component.displayName ?? Component.name ?? "Component"
        }WithLoginEnforced`;

        return ComponentWithLoginEnforced;
    }

    async function enforceLogin(redirectUrl: string = window.location.href): Promise<void | never> {
        const oidc = await getOidc();

        if (!oidc.isUserLoggedIn) {
            await oidc.login({
                redirectUrl,
                doesCurrentHrefRequiresAuth: location.href === redirectUrl
            });
        }
    }

    const prOidc = prOidcOrInitializationError.then(oidcOrInitializationError => {
        if (oidcOrInitializationError instanceof OidcInitializationError) {
            return new Promise<never>(() => {});
        }

        const oidc = oidcOrInitializationError;

        return oidc;
    });

    async function getOidc(): Promise<Oidc<DecodedIdToken>> {
        dReadyToCreate.resolve();

        // TODO: Directly return oidc in next major version
        const oidc = await prOidc;

        if (oidc.isUserLoggedIn) {
            await oidc.getTokens_next();
        }

        return oidc;
    }

    const oidcReact: OidcReactApi<DecodedIdToken, false> = {
        OidcProvider,
        useOidc: useOidc as any,
        getOidc,
        withLoginEnforced,
        enforceLogin
    };

    // @ts-expect-error: We know what we are doing
    return oidcReact;
}

/** @see: https://docs.oidc-spa.dev/v/v6/usage#react-api */
export function createReactOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    AutoLogin extends boolean = false
>(params: ValueOrAsyncGetter<ParamsOfCreateOidc<DecodedIdToken, AutoLogin>>) {
    return createOidcReactApi_dependencyInjection(params, createOidc);
}
