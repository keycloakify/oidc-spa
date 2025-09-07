import { useEffect, useState, useMemo, type ReactNode, type ComponentType, type FC } from "react";
import {
    type Oidc,
    createOidc,
    type ParamsOfCreateOidc,
    OidcInitializationError,
    handleOidcCallback
} from "../core";
import { assert, type Equals, type Param0 } from "../vendor/frontend/tsafe";
import { id } from "../vendor/frontend/tsafe";
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
    OidcInitializationErrorGate: (props: {
        ErrorFallback: (props: { initializationError: OidcInitializationError }) => ReactNode;
        children: ReactNode;
    }) => ReactNode;
    /** @deprecated Use Suspense instead. For handling initialization error, use OidcInitializationErrorGate */
    OidcProvider: AutoLogin extends true
        ? (props: {
              fallback?: ReactNode;
              ErrorFallback?: (props: { initializationError: OidcInitializationError }) => ReactNode;
              children: ReactNode;
          }) => ReactNode
        : (props: { fallback?: ReactNode; children: ReactNode }) => ReactNode;
    /** @see: https://docs.oidc-spa.dev/v/v6/error-management */
} & (AutoLogin extends true
    ? {}
    : {
          withLoginEnforced: <Props extends Record<string, unknown>>(
              Component: ComponentType<Props>,
              params?: {
                  onRedirecting: () => ReactNode;
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

    // NOTE: It can be InitializationError only if autoLogin is true
    const prOidcOrAutoLoginInitializationError = (async () => {
        // We're doing this here just for people that wouldn't have
        // configured the early init in entrypoint.
        {
            const { isHandled } = handleOidcCallback();

            if (isHandled) {
                return new Promise<never>(() => {});
            }
        }

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

    const { OidcInitializationErrorGate } = (() => {
        let oidcOrAutoLoginInitializationError:
            | Awaited<typeof prOidcOrAutoLoginInitializationError>
            | undefined = undefined;

        prOidcOrAutoLoginInitializationError.then(value => (oidcOrAutoLoginInitializationError = value));

        function OidcInitializationErrorGate(props: {
            ErrorFallback: (props: { initializationError: OidcInitializationError }) => ReactNode;
            children: ReactNode;
        }): ReactNode {
            const { ErrorFallback, children } = props;

            if (oidcOrAutoLoginInitializationError === undefined) {
                dReadyToCreate.resolve();
                throw prOidcOrAutoLoginInitializationError;
            }

            const initializationError = useMemo(() => {
                assert(oidcOrAutoLoginInitializationError !== undefined);

                if (oidcOrAutoLoginInitializationError instanceof OidcInitializationError) {
                    return oidcOrAutoLoginInitializationError;
                }

                const oidc = oidcOrAutoLoginInitializationError;

                if (oidc.isUserLoggedIn) {
                    return undefined;
                }

                return oidc.initializationError;
            }, []);

            if (initializationError !== undefined) {
                return <ErrorFallback initializationError={initializationError} />;
            }

            return children;
        }

        return { OidcInitializationErrorGate };
    })();

    function OidcProvider(props: {
        fallback?: ReactNode;
        ErrorFallback?: (props: { initializationError: OidcInitializationError }) => ReactNode;
        children: ReactNode;
    }): ReactNode {
        const { fallback, ErrorFallback, children } = props;

        const [oidcOrAutoLoginInitializationError, setOidcOrAutoLoginInitializationError] = useState<
            Awaited<typeof prOidcOrAutoLoginInitializationError> | undefined
        >(undefined);

        useEffect(() => {
            let isActive = true;

            dReadyToCreate.resolve();

            prOidcOrAutoLoginInitializationError.then(oidcOrAutoLoginInitializationError => {
                if (!isActive) {
                    return;
                }

                setOidcOrAutoLoginInitializationError(oidcOrAutoLoginInitializationError);
            });

            return () => {
                isActive = false;
            };
        }, []);

        if (oidcOrAutoLoginInitializationError === undefined) {
            return fallback;
        }

        const initializationError = useMemo(() => {
            if (oidcOrAutoLoginInitializationError instanceof OidcInitializationError) {
                return oidcOrAutoLoginInitializationError;
            }

            const oidc = oidcOrAutoLoginInitializationError;

            if (oidc.isUserLoggedIn) {
                return undefined;
            }

            return oidc.initializationError;
        }, []);

        if (initializationError !== undefined) {
            return ErrorFallback === undefined ? null : (
                <ErrorFallback initializationError={initializationError} />
            );
        }

        return children;
    }

    const { getOidc, useOidc } = (() => {
        const prOidc = prOidcOrAutoLoginInitializationError.then(value =>
            value instanceof OidcInitializationError ? new Promise<never>(() => {}) : value
        );

        let oidc: Oidc<DecodedIdToken> | undefined = undefined;

        prOidc.then(value => (oidc = value));

        async function getOidc(): Promise<Oidc<DecodedIdToken>> {
            dReadyToCreate.resolve();
            return prOidc;
        }

        function useOidc(): Oidc<DecodedIdToken> {
            if (oidc === undefined) {
                dReadyToCreate.resolve();
                throw prOidc;
            }

            return oidc;
        }

        return { getOidc, useOidc };
    })();

    const useAutoLogoutWarningCountdown: OidcReact.LoggedIn<DecodedIdToken>["useAutoLogoutWarningCountdown"] =
        ({ warningDurationSeconds }) => {
            const oidc = useOidc();

            const [secondsLeft, setSecondsLeft] = useState<number | undefined>(undefined);

            useEffect(() => {
                assert(oidc !== undefined);

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

    function useOidcReact(params?: {
        assert?: "user logged in" | "user not logged in";
    }): OidcReact<DecodedIdToken> {
        const { assert: assert_params } = params ?? {};

        const oidc = useOidc();

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

        const [memoDep, reRenderIfDecodedIdTokenChanged] = useState(
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

        const login = useMemo(
            () =>
                oidc.isUserLoggedIn
                    ? undefined
                    : id<OidcReact.NotLoggedIn["login"]>(
                          ({ doesCurrentHrefRequiresAuth = false, ...rest } = {}) =>
                              oidc.login({ doesCurrentHrefRequiresAuth, ...rest })
                      ),
            []
        );

        const oidcReact = useMemo((): OidcReact<DecodedIdToken> => {
            const common: OidcReact.Common = {
                params: oidc.params,
                useAutoLogoutWarningCountdown
            };

            if (!oidc.isUserLoggedIn) {
                assert(login !== undefined);
                return id<OidcReact.NotLoggedIn>({
                    ...common,
                    isUserLoggedIn: false,
                    login,
                    initializationError: oidc.initializationError
                });
            }

            return id<OidcReact.LoggedIn<DecodedIdToken>>({
                ...common,
                isUserLoggedIn: true,
                decodedIdToken: oidc.getDecodedIdToken(),
                logout: oidc.logout,
                renewTokens: oidc.renewTokens,
                goToAuthServer: oidc.goToAuthServer,
                isNewBrowserSession: oidc.isNewBrowserSession,
                backFromAuthServer: oidc.backFromAuthServer
            });
        }, [memoDep]);

        return oidcReact;
    }

    function withLoginEnforced<Props extends Record<string, unknown>>(
        Component: ComponentType<Props>,
        params?: {
            onRedirecting?: () => ReactNode;
        }
    ): FC<Props> {
        const { onRedirecting } = params ?? {};

        function ComponentWithLoginEnforced(props: Props) {
            const oidc = useOidc();

            useEffect(() => {
                if (oidc.isUserLoggedIn) {
                    return;
                }

                oidc.login({ doesCurrentHrefRequiresAuth: true });
            }, []);

            if (!oidc.isUserLoggedIn) {
                return onRedirecting === undefined ? null : onRedirecting();
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

    const oidcReact: OidcReactApi<DecodedIdToken, false> = {
        OidcProvider,
        OidcInitializationErrorGate,
        useOidc: useOidcReact as any,
        getOidc,
        withLoginEnforced,
        enforceLogin
    };

    // @ts-expect-error: We know what we are doing
    return oidcReact;
}

/** @see: https://docs.oidc-spa.dev/v/v7/usage#react-api */
export function createReactOidc<
    DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base,
    AutoLogin extends boolean = false
>(params: ValueOrAsyncGetter<ParamsOfCreateOidc<DecodedIdToken, AutoLogin>>) {
    return createOidcReactApi_dependencyInjection(params, createOidc);
}
