import { useState, useEffect, type ReactNode, createContext, useContext } from "react";
import type {
    CreateValidateAndGetAccessTokenClaims,
    OidcSpaApi,
    CreateOidcComponent,
    GetOidc,
    ParamsOfBootstrap,
    OidcServerContext
} from "./types";
import type { ZodSchemaLike } from "../../tools/ZodSchemaLike";
import type { Oidc as Oidc_core } from "../../core";
import { OidcInitializationError } from "../../core/OidcInitializationError";
import { Deferred } from "../../tools/Deferred";
import { isBrowser } from "../../tools/isBrowser";
import { assert, type Equals, is } from "../../tools/tsafe/assert";
import { infer_import_meta_env_BASE_URL } from "../../tools/infer_import_meta_env_BASE_URL";
import { createObjectThatThrowsIfAccessed } from "../../tools/createObjectThatThrowsIfAccessed";
import { createStatefulEvt } from "../../tools/StatefulEvt";
import { id } from "../../tools/tsafe/id";
import { typeGuard } from "../../tools/tsafe/typeGuard";
import type { GetterOrDirectValue } from "../../tools/GetterOrDirectValue";
import { createServerFn, createMiddleware } from "@tanstack/react-start";
// @ts-expect-error: Since our module is not labeled as ESM we don't have the types here.
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { toFullyQualifiedUrl } from "../../tools/toFullyQualifiedUrl";
import { UnifiedClientRetryForSsrLoadersError } from "./rfcUnifiedClientRetryForSsrLoaders/UnifiedClientRetryForSsrLoadersError";

export function createOidcSpaApi<
    AutoLogin extends boolean,
    DecodedIdToken extends Record<string, unknown>,
    AccessTokenClaims extends Record<string, unknown> | undefined
>(params: {
    autoLogin: AutoLogin;
    decodedIdTokenSchema:
        | ZodSchemaLike<Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec, DecodedIdToken>
        | undefined;
    decodedIdToken_mock: DecodedIdToken | undefined;
    createValidateAndGetAccessTokenClaims:
        | CreateValidateAndGetAccessTokenClaims<AccessTokenClaims>
        | undefined;
}): OidcSpaApi<AutoLogin, DecodedIdToken, AccessTokenClaims> {
    const {
        autoLogin,
        decodedIdTokenSchema,
        decodedIdToken_mock,
        createValidateAndGetAccessTokenClaims
    } = params;

    const dParamsOfBootstrap = new Deferred<
        ParamsOfBootstrap<AutoLogin, DecodedIdToken, AccessTokenClaims>
    >();

    const dOidcCoreOrInitializationError = new Deferred<
        Oidc_core<DecodedIdToken> | OidcInitializationError
    >();

    const evtAutoLogoutState = createStatefulEvt<
        CreateOidcComponent.Oidc.LoggedIn<unknown>["autoLogoutState"]
    >(() => ({
        shouldDisplayWarning: false
    }));

    dOidcCoreOrInitializationError.pr.then(oidcCoreOrInitializationError => {
        const { hasResolved, value: paramsOfBootstrap } = dParamsOfBootstrap.getState();

        assert(hasResolved);

        if (paramsOfBootstrap.implementation === "mock") {
            return;
        }
        assert<Equals<typeof paramsOfBootstrap.implementation, "real">>;

        const { startCountdownSecondsBeforeAutoLogout = 45 } = paramsOfBootstrap;

        if (
            oidcCoreOrInitializationError === undefined ||
            oidcCoreOrInitializationError instanceof OidcInitializationError
        ) {
            return;
        }

        const oidcCore = oidcCoreOrInitializationError;

        if (!oidcCore.isUserLoggedIn) {
            return;
        }

        oidcCore.subscribeToAutoLogoutCountdown(({ secondsLeft }) => {
            const newState: CreateOidcComponent.Oidc.LoggedIn<unknown>["autoLogoutState"] = (() => {
                if (secondsLeft === undefined) {
                    return {
                        shouldDisplayWarning: false
                    };
                }

                if (secondsLeft > startCountdownSecondsBeforeAutoLogout) {
                    return {
                        shouldDisplayWarning: false
                    };
                }

                return {
                    shouldDisplayWarning: true,
                    secondsLeftBeforeAutoLogout: secondsLeft
                };
            })();

            if (!newState.shouldDisplayWarning && !evtAutoLogoutState.current.shouldDisplayWarning) {
                return;
            }

            evtAutoLogoutState.current = newState;
        });
    });

    function useOidc(): CreateOidcComponent.Oidc<DecodedIdToken> {
        const { hasResolved, value: oidcCore } = dOidcCoreOrInitializationError.getState();

        assert(hasResolved);
        assert(!(oidcCore instanceof OidcInitializationError));

        const [, reRenderIfDecodedIdTokenChanged] = useState<DecodedIdToken | undefined>(() => {
            if (!oidcCore.isUserLoggedIn) {
                return undefined;
            }
            return oidcCore.getDecodedIdToken();
        });

        const [evtIsDecodedIdTokenUsed] = useState(() => createStatefulEvt<boolean>(() => false));

        useEffect(() => {
            if (!oidcCore.isUserLoggedIn) {
                return;
            }

            let isActive = true;

            let unsubscribe: (() => void) | undefined = undefined;

            (async () => {
                if (!evtIsDecodedIdTokenUsed.current) {
                    const dDecodedIdTokenUsed = new Deferred<void>();

                    const { unsubscribe: unsubscribe_scope } = evtIsDecodedIdTokenUsed.subscribe(() => {
                        unsubscribe_scope();
                        dDecodedIdTokenUsed.resolve();
                    });
                    unsubscribe = unsubscribe_scope;

                    await dDecodedIdTokenUsed.pr;

                    if (!isActive) {
                        return;
                    }
                }

                reRenderIfDecodedIdTokenChanged(oidcCore.getDecodedIdToken());

                unsubscribe = oidcCore.subscribeToTokensChange(() => {
                    reRenderIfDecodedIdTokenChanged(oidcCore.getDecodedIdToken());
                }).unsubscribe;
            })();

            return () => {
                isActive = false;
                unsubscribe?.();
            };
        }, []);

        const [evtIsAutoLogoutStateUsed] = useState(() => createStatefulEvt<boolean>(() => false));

        const [, reRenderIfAutoLogoutStateChanged] = useState(() => evtAutoLogoutState.current);

        useEffect(() => {
            let isActive = true;
            let unsubscribe: (() => void) | undefined = undefined;

            (async () => {
                if (!evtIsAutoLogoutStateUsed.current) {
                    const dAutoLogoutStateUsed = new Deferred<void>();

                    const { unsubscribe: unsubscribe_scope } = evtIsAutoLogoutStateUsed.subscribe(() => {
                        unsubscribe_scope();
                        dAutoLogoutStateUsed.resolve();
                    });
                    unsubscribe = unsubscribe_scope;

                    await dAutoLogoutStateUsed.pr;

                    if (!isActive) {
                        return;
                    }
                }

                reRenderIfAutoLogoutStateChanged(evtAutoLogoutState.current);

                unsubscribe = evtAutoLogoutState.subscribe(reRenderIfAutoLogoutStateChanged).unsubscribe;
            })();

            return () => {
                isActive = false;
                unsubscribe?.();
            };
        }, []);

        if (!oidcCore.isUserLoggedIn) {
            return id<CreateOidcComponent.Oidc.NotLoggedIn>({
                isUserLoggedIn: false,
                initializationError: oidcCore.initializationError,
                issuerUri: oidcCore.params.issuerUri,
                clientId: oidcCore.params.clientId,
                autoLogoutState: { shouldDisplayWarning: false },
                login: params =>
                    oidcCore.login({
                        doesCurrentHrefRequiresAuth: false,
                        ...params
                    })
            });
        }

        return id<CreateOidcComponent.Oidc.LoggedIn<DecodedIdToken>>({
            isUserLoggedIn: true,
            get decodedIdToken() {
                evtIsDecodedIdTokenUsed.current = true;
                return oidcCore.getDecodedIdToken();
            },
            logout: oidcCore.logout,
            renewTokens: oidcCore.renewTokens,
            goToAuthServer: oidcCore.goToAuthServer,
            backFromAuthServer: oidcCore.backFromAuthServer,
            isNewBrowserSession: oidcCore.isNewBrowserSession,
            get autoLogoutState() {
                evtIsAutoLogoutStateUsed.current = true;
                return evtAutoLogoutState.current;
            },
            issuerUri: oidcCore.params.issuerUri,
            clientId: oidcCore.params.clientId
        });
    }

    const context_isFreeOfSsrHydrationConcern = createContext<boolean>(false);

    function createOidcComponent<Props extends Record<string, unknown>>(params: {
        assert?: "user logged in" | "user not logged in";
        pendingComponent?: (props: NoInfer<Props>) => ReactNode;
        component: (props: Props) => ReactNode;
    }): ((props: Props) => ReactNode) & {
        useOidc: () => CreateOidcComponent.Oidc<DecodedIdToken>;
    } {
        const {
            assert: assert_params,
            pendingComponent: PendingComponent,
            component: Component
        } = params;

        const checkAssertion =
            assert_params === undefined
                ? undefined
                : (params: { isUserLoggedIn: boolean }): void => {
                      const { isUserLoggedIn } = params;

                      switch (assert_params) {
                          case "user not logged in":
                              if (isUserLoggedIn) {
                                  throw new Error(
                                      [
                                          "oidc-spa: Asserted the user should not be logged in",
                                          "but they are. Check your control flow."
                                      ].join(" ")
                                  );
                              }
                              break;
                          case "user logged in":
                              if (!isUserLoggedIn) {
                                  throw new Error(
                                      [
                                          "oidc-spa: Asserted the user should be logged in",
                                          "but they arn't. Check your control flow."
                                      ].join(" ")
                                  );
                              }
                              break;
                          default:
                              assert<Equals<typeof assert_params, never>>;
                      }
                  };

        function ComponentWithOidc(props: Props) {
            const renderFallback = () =>
                PendingComponent === undefined ? null : <PendingComponent {...props} />;

            if (!isBrowser) {
                return renderFallback();
            }

            // NOTE: When the user assert that the user is logged in or not, they know.
            // if they knows it means that they learned it somewhere so we are post SSR.
            // Additionally, in autoLogin mode, the typedef don't allow this param to be provided.
            const isFreeOfSsrHydrationConcern =
                useContext(context_isFreeOfSsrHydrationConcern) || assert_params !== undefined;

            const [oidcCore, setOidcCore] = useState<Oidc_core<DecodedIdToken> | undefined>(() => {
                if (!isFreeOfSsrHydrationConcern) {
                    return undefined;
                }

                const { hasResolved, value: oidcCore } = dOidcCoreOrInitializationError.getState();

                if (!hasResolved) {
                    return undefined;
                }

                if (oidcCore instanceof OidcInitializationError) {
                    return undefined;
                }

                checkAssertion?.({
                    isUserLoggedIn: oidcCore.isUserLoggedIn
                });

                return oidcCore;
            });

            useEffect(() => {
                if (oidcCore !== undefined) {
                    return;
                }

                let isActive = true;

                dOidcCoreOrInitializationError.pr.then(oidcCore => {
                    if (!isActive) {
                        return;
                    }

                    if (oidcCore instanceof OidcInitializationError) {
                        return;
                    }

                    checkAssertion?.({
                        isUserLoggedIn: oidcCore.isUserLoggedIn
                    });

                    setOidcCore(oidcCore);
                });

                return () => {
                    isActive = false;
                };
            }, []);

            if (oidcCore === undefined) {
                return PendingComponent === undefined ? null : <PendingComponent {...props} />;
            }

            return (
                <context_isFreeOfSsrHydrationConcern.Provider value={true}>
                    <Component {...props} />
                </context_isFreeOfSsrHydrationConcern.Provider>
            );
        }

        ComponentWithOidc.displayName = `${
            (Component as any).displayName ?? Component.name ?? "Component"
        }WithOidc`;

        ComponentWithOidc.useOidc = useOidc;

        return ComponentWithOidc;
    }

    async function getOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): Promise<GetOidc.Oidc<DecodedIdToken>> {
        if (!isBrowser) {
            throw new UnifiedClientRetryForSsrLoadersError(
                [
                    "oidc-spa: getOidc() can't be used on the server",
                    "if you use it in a loader, make sure to mark the route",
                    "as `ssr: false`."
                ].join(" ")
            );
        }

        const oidcCore = await dOidcCoreOrInitializationError.pr;

        if (oidcCore instanceof OidcInitializationError) {
            return new Promise<never>(() => {});
        }

        if (params?.assert === "user logged in" && !oidcCore.isUserLoggedIn) {
            throw new Error(
                [
                    "oidc-spa: Called getOidc({ assert: 'user logged in' })",
                    "but the user is not currently logged in."
                ].join(" ")
            );
        }
        if (params?.assert === "user not logged in" && oidcCore.isUserLoggedIn) {
            throw new Error(
                [
                    "oidc-spa: Called getOidc({ assert: 'user not logged in' })",
                    "but the user is currently logged in."
                ].join(" ")
            );
        }

        return oidcCore.isUserLoggedIn
            ? id<GetOidc.Oidc.LoggedIn<DecodedIdToken>>({
                  issuerUri: oidcCore.params.issuerUri,
                  clientId: oidcCore.params.clientId,
                  isUserLoggedIn: true,
                  getAccessToken: async () => {
                      const { accessToken } = await oidcCore.getTokens();
                      return accessToken;
                  },
                  getDecodedIdToken: oidcCore.getDecodedIdToken,
                  logout: oidcCore.logout,
                  renewTokens: oidcCore.renewTokens,
                  goToAuthServer: oidcCore.goToAuthServer,
                  backFromAuthServer: oidcCore.backFromAuthServer,
                  isNewBrowserSession: oidcCore.isNewBrowserSession,
                  subscribeToAutoLogoutState: next => {
                      next(evtAutoLogoutState.current);

                      const { unsubscribe } = evtAutoLogoutState.subscribe(next);

                      return { unsubscribeFromAutoLogoutState: unsubscribe };
                  }
              })
            : id<GetOidc.Oidc.NotLoggedIn>({
                  issuerUri: oidcCore.params.issuerUri,
                  clientId: oidcCore.params.clientId,
                  isUserLoggedIn: false,
                  initializationError: oidcCore.initializationError,
                  login: oidcCore.login
              });
    }

    let hasBootstrapBeenCalled = false;

    const prModuleCore = !isBrowser ? undefined : import("../../core");

    const bootstrapOidc = (
        getParamsOfBootstrapOrDirectValue: GetterOrDirectValue<
            { process: { env: Record<string, string> } },
            ParamsOfBootstrap<AutoLogin, DecodedIdToken, AccessTokenClaims>
        >
    ) => {
        if (hasBootstrapBeenCalled) {
            return;
        }

        hasBootstrapBeenCalled = true;

        (async () => {
            const getParamsOfBootstrap =
                typeof getParamsOfBootstrapOrDirectValue === "function"
                    ? getParamsOfBootstrapOrDirectValue
                    : () => getParamsOfBootstrapOrDirectValue;

            if (!isBrowser) {
                const missingEnvNames = new Set<string>();

                const env_proxy = new Proxy<Record<string, string>>(
                    {},
                    {
                        get: (...[, envName]) => {
                            assert(typeof envName === "string");

                            const value = process.env[envName];

                            if (value === undefined) {
                                missingEnvNames.add(envName);
                                return "";
                            }

                            return value;
                        },
                        has: (...[, envName]) => {
                            assert(typeof envName === "string");
                            return true;
                        }
                    }
                );

                const paramsOfBootstrap = getParamsOfBootstrap({ process: { env: env_proxy } });

                if (
                    paramsOfBootstrap.implementation === "real" &&
                    (!paramsOfBootstrap.issuerUri || !paramsOfBootstrap.clientId)
                ) {
                    throw new Error(
                        [
                            "oidc-spa: Incorrect configuration provided:\n",
                            JSON.stringify(paramsOfBootstrap, null, 2),
                            ...(missingEnvNames.size === 0
                                ? []
                                : [
                                      "\nYou probably forgot to define the environnement variables:",
                                      Array.from(missingEnvNames).join(", ")
                                  ])
                        ].join(" ")
                    );
                }

                dParamsOfBootstrap.resolve(paramsOfBootstrap);
                return;
            }

            assert(prModuleCore !== undefined);

            const paramsOfBootstrap = await (async () => {
                let envNamesToPullFromServer = new Set<string>();

                const env: Record<string, string> = {};

                const env_proxy = new Proxy(env, {
                    get: (...[, envName]) => {
                        assert(typeof envName === "string");

                        if (envName in env) {
                            return env[envName];
                        }

                        envNamesToPullFromServer.add(envName);

                        return "oidc_spa_probe";
                    },
                    has: (...[, envName]) => {
                        assert(typeof envName === "string");

                        if (envName in env) {
                            return true;
                        }

                        envNamesToPullFromServer.add(envName);

                        return true;
                    }
                });

                let result:
                    | {
                          hasThrown: false;
                          paramsOfBootstrap: ParamsOfBootstrap<
                              AutoLogin,
                              DecodedIdToken,
                              AccessTokenClaims
                          >;
                      }
                    | {
                          hasThrown: true;
                          error: unknown;
                      }
                    | undefined = undefined;

                while (true) {
                    envNamesToPullFromServer = new Set();

                    result = undefined;

                    try {
                        const paramsOfBootstrap = getParamsOfBootstrap({ process: { env: env_proxy } });
                        result = {
                            hasThrown: false,
                            paramsOfBootstrap
                        };
                    } catch (error) {
                        result = {
                            hasThrown: true,
                            error
                        };
                    }

                    if (envNamesToPullFromServer.size === 0) {
                        break;
                    }

                    Object.entries(
                        await fetchServerEnvVariableValues({
                            data: {
                                envVarNames: Array.from(envNamesToPullFromServer)
                            }
                        })
                    ).forEach(([envName, value]) => {
                        env[envName] = value;
                    });
                }

                if (result.hasThrown) {
                    throw new Error(
                        [
                            "oidc-spa: The function argument passed to bootstrapOidc",
                            "has thrown when invoked."
                        ].join(" "),
                        //@ts-expect-error
                        { cause: result.error }
                    );
                }

                return result.paramsOfBootstrap;
            })();

            dParamsOfBootstrap.resolve(paramsOfBootstrap);

            switch (paramsOfBootstrap.implementation) {
                case "mock":
                    {
                        const { createMockOidc } = await import("../../mock/oidc");

                        const oidcCore = await createMockOidc({
                            homeUrl: infer_import_meta_env_BASE_URL(),
                            // NOTE: The `as false` is lying here, it's just to preserve some level of type-safety.
                            autoLogin: autoLogin as false,
                            // NOTE: Same here, the nullish coalescing is lying.
                            isUserInitiallyLoggedIn: paramsOfBootstrap.isUserInitiallyLoggedIn!,
                            mockedParams: {
                                clientId: paramsOfBootstrap.clientId_mock,
                                issuerUri: paramsOfBootstrap.issuerUri_mock
                            },
                            mockedTokens: {
                                decodedIdToken:
                                    paramsOfBootstrap.decodedIdToken_mock ??
                                    decodedIdToken_mock ??
                                    createObjectThatThrowsIfAccessed<DecodedIdToken>({
                                        debugMessage: [
                                            "oidc-spa: You didn't provide any mock for the decodedIdToken",
                                            "Either provide a default one by specifying decodedIdToken_mock",
                                            "as parameter of .withExpectedDecodedIdTokenShape() or",
                                            "specify decodedIdToken_mock when calling bootstrapOidc()"
                                        ].join(" ")
                                    })
                            }
                        });

                        dOidcCoreOrInitializationError.resolve(oidcCore);
                    }
                    break;
                case "real":
                    {
                        const { createOidc } = await prModuleCore;

                        const homeUrl = infer_import_meta_env_BASE_URL();

                        let oidcCoreOrInitializationError:
                            | Oidc_core<DecodedIdToken>
                            | OidcInitializationError;

                        try {
                            oidcCoreOrInitializationError = await createOidc({
                                homeUrl,
                                autoLogin,
                                decodedIdTokenSchema,
                                issuerUri: paramsOfBootstrap.issuerUri,
                                clientId: paramsOfBootstrap.clientId,
                                idleSessionLifetimeInSeconds:
                                    paramsOfBootstrap.idleSessionLifetimeInSeconds,
                                scopes: paramsOfBootstrap.scopes,
                                transformUrlBeforeRedirect: paramsOfBootstrap.transformUrlBeforeRedirect,
                                extraQueryParams: paramsOfBootstrap.extraQueryParams,
                                extraTokenParams: paramsOfBootstrap.extraTokenParams,
                                noIframe: paramsOfBootstrap.noIframe,
                                debugLogs: paramsOfBootstrap.debugLogs,
                                __unsafe_clientSecret: paramsOfBootstrap.__unsafe_clientSecret,
                                __metadata: paramsOfBootstrap.__metadata
                            });
                        } catch (error) {
                            if (!(error instanceof OidcInitializationError)) {
                                throw error;
                            }
                            dOidcCoreOrInitializationError.resolve(error);
                            return;
                        }

                        dOidcCoreOrInitializationError.resolve(oidcCoreOrInitializationError);
                    }
                    break;
            }
        })();
    };

    async function enforceLogin(loaderContext: {
        cause: "preload" | string;
        location: {
            href: string;
        };
    }): Promise<void | never> {
        if (!isBrowser) {
            throw new UnifiedClientRetryForSsrLoadersError(
                [
                    "oidc-spa: enforceLogin cannot be used on the server",
                    "make sure to mark any route that uses it as ssr: false"
                ].join(" ")
            );
        }

        const { cause } = loaderContext;

        const redirectUrl = (() => {
            if (loaderContext.location?.href !== undefined) {
                return toFullyQualifiedUrl({
                    urlish: loaderContext.location.href,
                    doAssertNoQueryParams: false
                });
            }

            return location.href;
        })();

        const oidc = await getOidc();

        if (!oidc.isUserLoggedIn) {
            if (cause === "preload") {
                throw new Error(
                    [
                        "oidc-spa: User is not yet logged in.",
                        "This is not an error, this is an expected case.",
                        "It's only TanStack Router using exception as control flow."
                    ].join(" ")
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

    enforceLogin.__isOidcSpaEnforceLogin = true;

    function OidcInitializationGate(props: {
        renderFallback: (props: {
            initializationError: OidcInitializationError | undefined;
        }) => ReactNode;
        children: ReactNode;
    }): ReactNode {
        const { renderFallback, children } = props;

        const [oidcCoreOrInitializationError, setOidcCoreOrInitializationError] = useState<
            Oidc_core<DecodedIdToken> | OidcInitializationError | undefined
        >(undefined);

        useEffect(() => {
            let isActive = true;

            dOidcCoreOrInitializationError.pr.then(oidcCoreOrInitializationError => {
                if (!isActive) {
                    return;
                }
                setOidcCoreOrInitializationError(oidcCoreOrInitializationError);
            });

            return () => {
                isActive = false;
            };
        }, []);

        if (
            oidcCoreOrInitializationError === undefined ||
            oidcCoreOrInitializationError instanceof OidcInitializationError
        ) {
            return renderFallback({ initializationError: oidcCoreOrInitializationError });
        }

        return (
            <context_isFreeOfSsrHydrationConcern.Provider value={true}>
                {children}
            </context_isFreeOfSsrHydrationConcern.Provider>
        );
    }

    const prValidateAndGetAccessTokenClaims =
        createValidateAndGetAccessTokenClaims === undefined
            ? undefined
            : dParamsOfBootstrap.pr.then(paramsOfBootstrap =>
                  createValidateAndGetAccessTokenClaims({
                      // @ts-expect-error
                      paramsOfBootstrap
                  })
              );

    function createFunctionMiddlewareServerFn(params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }) {
        return async (options: {
            next: (options: { context: { oidc: OidcServerContext<AccessTokenClaims> } }) => any;
        }): Promise<any> => {
            const { next } = options;

            const unauthorized = (params: {
                errorMessage: string;
                wwwAuthenticateHeaderErrorDescription: string;
            }) => {
                const { errorMessage, wwwAuthenticateHeaderErrorDescription } = params;

                setResponseHeader(
                    "WWW-Authenticate",
                    `Bearer error="invalid_token", error_description="${wwwAuthenticateHeaderErrorDescription}"`
                );
                setResponseStatus(401, "Unauthorized");

                return new Error(`oidc-spa: ${errorMessage}`);
            };

            const { headers } = getRequest();

            const authorizationHeaderValue = headers.get("Authorization");

            if (authorizationHeaderValue === null) {
                if (params?.assert === "user logged in") {
                    const errorMessage = [
                        "Asserted user logged in for that serverFn request",
                        "but no access token was attached to the request"
                    ].join(" ");

                    throw unauthorized({
                        errorMessage,
                        wwwAuthenticateHeaderErrorDescription: errorMessage
                    });
                }

                return next({
                    context: {
                        oidc: id<OidcServerContext<AccessTokenClaims>>(
                            id<OidcServerContext.NotLoggedIn>({
                                isUserLoggedIn: false
                            })
                        )
                    }
                });
            }

            const accessToken = (() => {
                const prefix = "Bearer ";

                if (!authorizationHeaderValue.startsWith(prefix)) {
                    return undefined;
                }

                return authorizationHeaderValue.slice(prefix.length);
            })();

            if (accessToken === undefined) {
                const errorMessage =
                    "Missing well formed Authorization header with Bearer <access_token>";

                throw unauthorized({
                    errorMessage,
                    wwwAuthenticateHeaderErrorDescription: errorMessage
                });
            }

            assert(prValidateAndGetAccessTokenClaims !== undefined);

            const { validateAndGetAccessTokenClaims } = await prValidateAndGetAccessTokenClaims;

            const resultOfValidate = await validateAndGetAccessTokenClaims({ accessToken });

            if (!resultOfValidate.isValid) {
                const { errorMessage, wwwAuthenticateHeaderErrorDescription } = resultOfValidate;

                throw unauthorized({
                    errorMessage,
                    wwwAuthenticateHeaderErrorDescription
                });
            }

            const { accessTokenClaims } = resultOfValidate;

            assert(is<Exclude<AccessTokenClaims, undefined>>(accessTokenClaims));

            check_required_claims: {
                const getHasRequiredClaims = params?.hasRequiredClaims;

                if (getHasRequiredClaims === undefined) {
                    break check_required_claims;
                }

                const accessedClaimNames = new Set<string>();

                const accessTokenClaims_proxy = new Proxy(accessTokenClaims, {
                    get(...args) {
                        const [, claimName] = args;

                        record_claim_access: {
                            if (typeof claimName !== "string") {
                                break record_claim_access;
                            }

                            accessedClaimNames.add(claimName);
                        }

                        return Reflect.get(...args);
                    }
                });

                const hasRequiredClaims = await getHasRequiredClaims({
                    accessTokenClaims: accessTokenClaims_proxy
                });

                if (hasRequiredClaims) {
                    break check_required_claims;
                }

                const errorMessage = [
                    "Missing or invalid required access token claim.",
                    `Related to claims: ${Array.from(accessedClaimNames).join(" and/or ")}`
                ].join(" ");

                throw unauthorized({
                    errorMessage,
                    wwwAuthenticateHeaderErrorDescription: errorMessage
                });
            }

            return next({
                context: {
                    oidc: id<OidcServerContext<AccessTokenClaims>>(
                        id<OidcServerContext.LoggedIn<AccessTokenClaims>>({
                            isUserLoggedIn: true,
                            accessToken,
                            accessTokenClaims
                        })
                    )
                }
            });
        };
    }

    function oidcRequestMiddleware(params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }) {
        return createMiddleware({ type: "request" }).server<{
            oidc: OidcServerContext<AccessTokenClaims>;
        }>(createFunctionMiddlewareServerFn(params));
    }

    function oidcFnMiddleware(params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }) {
        return createMiddleware({ type: "function" })
            .client(async ({ next }) => {
                const oidc = await getOidc();

                if (params?.assert === "user logged in" && !oidc.isUserLoggedIn) {
                    throw new Error(
                        [
                            "oidc-spa: You used oidcFnMiddleware({ assert: 'user logged in' })",
                            "but the server function the middleware was attached to was called",
                            "while the user is not logged in."
                        ].join(" ")
                    );
                }

                if (!oidc.isUserLoggedIn) {
                    return next();
                }

                return next({
                    headers: {
                        Authorization: `Bearer ${await oidc.getAccessToken()}`
                    }
                });
            })
            .server<{
                oidc: OidcServerContext<AccessTokenClaims>;
            }>(createFunctionMiddlewareServerFn(params));
    }

    // @ts-expect-error
    return {
        createOidcComponent,
        getOidc,
        bootstrapOidc,
        enforceLogin,
        OidcInitializationGate,
        oidcFnMiddleware,
        oidcRequestMiddleware
    };
}

const fetchServerEnvVariableValues = createServerFn({ method: "GET" })
    .inputValidator((data: { envVarNames: string[] }) => {
        if (typeof data !== "object" || data === null) {
            throw new Error("Expected an object");
        }

        const { envVarNames } = data as Record<string, unknown>;

        assert(
            typeGuard<string[]>(
                envVarNames,
                Array.isArray(envVarNames) && envVarNames.every(name => typeof name === "string")
            )
        );

        return { envVarNames };
    })
    .handler(async ({ data }) => {
        const { envVarNames } = data;
        return Object.fromEntries(
            envVarNames.map(envVarName => [envVarName, process.env[envVarName] ?? ""])
        );
    });
