import {
    useEffect,
    useState,
    createContext,
    useContext,
    type ReactNode,
    type ComponentType,
    type FC,
    type JSX
} from "react";
import { type Oidc, createOidc, type ParamsOfCreateOidc, OidcInitializationError } from "../core";
import { assert, type Equals } from "../tools/tsafe/assert";
import type { Param0 } from "../tools/tsafe/Param0";
import { id } from "../tools/tsafe/id";
import type { ValueOrAsyncGetter } from "../tools/ValueOrAsyncGetter";
import { Deferred } from "../tools/Deferred";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";

export type OidcReact<DecodedIdToken extends Record<string, unknown>> =
    | OidcReact.NotLoggedIn
    | OidcReact.LoggedIn<DecodedIdToken>;

export namespace OidcReact {
    export type Common = Oidc.Common & {
        useAutoLogoutWarningCountdown: (params: { warningDurationSeconds: number }) => {
            secondsLeft: number | undefined;
        };
    };

    export type NotLoggedIn = Common & {
        isUserLoggedIn: false;
        login: (params?: {
            extraQueryParams?: Record<string, string | undefined>;
            redirectUrl?: string;
            transformUrlBeforeRedirect?: (url: string) => string;
            doesCurrentHrefRequiresAuth?: boolean;
        }) => Promise<never>;
        initializationError: OidcInitializationError | undefined;

        decodedIdToken?: never;
        logout?: never;
        renewTokens?: never;
        goToAuthServer?: never;
        backFromAuthServer?: never;
        isNewBrowserSession?: never;
    };

    export type LoggedIn<DecodedIdToken extends Record<string, unknown>> = Common & {
        isUserLoggedIn: true;
        decodedIdToken: DecodedIdToken;
        logout: Oidc.LoggedIn["logout"];
        renewTokens: Oidc.LoggedIn["renewTokens"];
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
          enforceLogin: (loaderParams: {
              request?: { url?: string };
              cause?: "preload" | string;
              location?: {
                  href?: string;
              };
          }) => Promise<void | never>;
      });

export function createReactOidc_dependencyInjection<
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
            await dReadyToCreate.pr;

            if (typeof paramsOrGetParams === "function") {
                const getParams = paramsOrGetParams;

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

    let prOidcOrInitializationError_resolvedValue:
        | Oidc<DecodedIdToken>
        | OidcInitializationError
        | undefined = undefined;
    prOidcOrInitializationError.then(value => (prOidcOrInitializationError_resolvedValue = value));

    function OidcProvider(props: {
        fallback?: ReactNode;
        ErrorFallback?: (props: { initializationError: OidcInitializationError }) => ReactNode;
        children: ReactNode;
    }) {
        const { fallback, ErrorFallback, children } = props;

        const [oidcOrInitializationError, setOidcOrInitializationError] = useState<
            Oidc<DecodedIdToken> | OidcInitializationError | undefined
        >(prOidcOrInitializationError_resolvedValue);

        useEffect(() => {
            if (oidcOrInitializationError !== undefined) {
                return;
            }

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

    const useAutoLogoutWarningCountdown: OidcReact.LoggedIn<DecodedIdToken>["useAutoLogoutWarningCountdown"] =
        ({ warningDurationSeconds }) => {
            const contextValue = useContext(oidcContext);

            assert(contextValue !== undefined);

            const { oidc } = contextValue;

            const [secondsLeft, setSecondsLeft] = useState<number | undefined>(undefined);

            useEffect(() => {
                if (!oidc.isUserLoggedIn) {
                    return;
                }

                const { unsubscribeFromAutoLogoutCountdown } = oidc.subscribeToAutoLogoutCountdown(
                    ({ secondsLeft }) =>
                        setSecondsLeft(
                            secondsLeft === undefined || secondsLeft > warningDurationSeconds
                                ? undefined
                                : secondsLeft
                        )
                );

                return () => {
                    unsubscribeFromAutoLogoutCountdown();
                };
            }, [warningDurationSeconds]);

            return { secondsLeft };
        };

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

        const [, reRenderIfDecodedIdTokenChanged] = useState(
            !oidc.isUserLoggedIn ? undefined : oidc.getDecodedIdToken()
        );

        useEffect(() => {
            if (!oidc.isUserLoggedIn) {
                return;
            }

            const { unsubscribe } = oidc.subscribeToTokensChange(() =>
                reRenderIfDecodedIdTokenChanged(oidc.getDecodedIdToken())
            );

            reRenderIfDecodedIdTokenChanged(oidc.getDecodedIdToken());

            return unsubscribe;
        }, []);

        const common: OidcReact.Common = {
            params: oidc.params,
            useAutoLogoutWarningCountdown
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
            decodedIdToken: oidc.getDecodedIdToken(),
            logout: oidc.logout,
            renewTokens: oidc.renewTokens,
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

            assert(contextValue !== undefined, "094283");

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

    async function enforceLogin(loaderParams: {
        request?: { url?: string };
        cause?: "preload" | string;
        location?: { href?: string };
    }): Promise<void | never> {
        const { cause } = loaderParams;

        const redirectUrl = (() => {
            if (loaderParams.request?.url !== undefined) {
                return toFullyQualifiedUrl({
                    urlish: loaderParams.request.url,
                    doAssertNoQueryParams: false
                });
            }

            if (loaderParams.location?.href !== undefined) {
                return toFullyQualifiedUrl({
                    urlish: loaderParams.location.href,
                    doAssertNoQueryParams: false
                });
            }

            return location.href;
        })();

        const oidc = await getOidc();

        if (!oidc.isUserLoggedIn) {
            if (cause === "preload") {
                throw new Error(
                    "oidc-spa: User is not yet logged in. This is an expected error, nothing to be addressed."
                );
            }
            const doesCurrentHrefRequiresAuth =
                location.href.replace(/\/$/, "") === redirectUrl.replace(/\/$/, "");

            await oidc.login({
                redirectUrl,
                doesCurrentHrefRequiresAuth
            });
        }
    }

    async function getOidc(): Promise<Oidc<DecodedIdToken>> {
        dReadyToCreate.resolve();

        const oidcOrInitializationError = await prOidcOrInitializationError;

        if (oidcOrInitializationError instanceof OidcInitializationError) {
            const error = oidcOrInitializationError;
            throw error;
        }

        const oidc = oidcOrInitializationError;

        return oidc;
    }

    const oidcReactApi: OidcReactApi<DecodedIdToken, false> = {
        OidcProvider,
        useOidc: useOidc as any,
        getOidc,
        withLoginEnforced,
        enforceLogin
    };

    // @ts-expect-error: We know what we are doing
    return oidcReactApi;
}

/** @see: https://docs.oidc-spa.dev/v/v8/usage#react-api */
export function createReactOidc<
    DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base,
    AutoLogin extends boolean = false
>(params: ValueOrAsyncGetter<ParamsOfCreateOidc<DecodedIdToken, AutoLogin>>) {
    return createReactOidc_dependencyInjection(params, createOidc);
}
