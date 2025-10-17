import { useState, useEffect, type ReactNode } from "react";
import type {
    CreateValidateAndGetAccessTokenClaims,
    OidcSpaApi,
    UseOidc,
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
import type { GetterOrDirectValue } from "../../tools/GetterOrDirectValue";
import { createServerFn, createMiddleware } from "@tanstack/react-start";
import type { PotentiallyDeferred } from "../../tools/PotentiallyDeferred";
import { toFullyQualifiedUrl } from "../../tools/toFullyQualifiedUrl";

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

    const evtAutoLogoutState = createStatefulEvt<UseOidc.Oidc.LoggedIn<unknown>["autoLogoutState"]>(
        () => ({
            shouldDisplayWarning: false
        })
    );

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
            const newState: UseOidc.Oidc.LoggedIn<unknown>["autoLogoutState"] = (() => {
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

    function useOidc(params?: {
        assert?: "user not logged in" | "user logged in";
    }): UseOidc.Oidc<DecodedIdToken> {
        const { hasResolved, value: oidcCoreOrInitializationError } =
            dOidcCoreOrInitializationError.getState();

        if (
            autoLogin &&
            (!hasResolved || oidcCoreOrInitializationError instanceof OidcInitializationError)
        ) {
            throw new Error(
                [
                    "oidc-spa: Since you have enabled autoLogin, every usage of useOidc()",
                    "should be made into a descendant of <OidcInitializationGage />"
                ].join(" ")
            );
        }

        assert(!(oidcCoreOrInitializationError instanceof OidcInitializationError));

        if (params?.assert === "user logged in") {
            if (!hasResolved || !oidcCoreOrInitializationError.isUserLoggedIn) {
                throw new Error(
                    [
                        "oidc-spa: useOidc() was called asserting the user logged in",
                        "but it's not the case.",
                        hasResolved
                            ? "The user is not logged in"
                            : [
                                  "The oidc initialization process hasn't completed yet.",
                                  "We don't know yet if the user is logged in or not at this time."
                              ].join(" "),
                        "To make sure this doesn't happen thou should either mark the route as",
                        "protected with beforeLoad: enforceLogin or control the flow or your app",
                        "making sure to only mount components that call",
                        "useOidc({ assert: 'user logged in' }) when you have previously tested that",
                        "const { isUserLoggedIn } = useOidc() is true in a parent component."
                    ].join(" ")
                );
            }
        }

        const [oidcCore, setOidcCore] = useState<Oidc_core<DecodedIdToken> | undefined>(
            params?.assert === "user logged in" ? oidcCoreOrInitializationError : undefined
        );

        useEffect(() => {
            if (hasResolved) {
                return;
            }

            let isActive = true;

            dOidcCoreOrInitializationError.pr.then(oidcCore => {
                if (!isActive) {
                    return;
                }

                assert(!(oidcCore instanceof OidcInitializationError));

                setOidcCore(oidcCore);
            });

            return () => {
                isActive = false;
            };
        }, []);

        if (
            oidcCore !== undefined &&
            oidcCore.isUserLoggedIn &&
            params?.assert === "user not logged in"
        ) {
            throw new Error(
                [
                    "oidc-spa: Used useOidc() asserting the user is NOT logged in",
                    "but it isn't the case, the user is logged in.",
                    "Make sure to only mount components that call",
                    "useOidc({ assert: 'user not logged in' }) when you have previously tested that",
                    "const { isUserLoggedIn } = useOidc() is falsish in a parent component."
                ].join(" ")
            );
        }

        const [, reRenderIfDecodedIdTokenChanged] = useState<DecodedIdToken | undefined>(() => {
            if (oidcCore === undefined) {
                return undefined;
            }

            if (!oidcCore.isUserLoggedIn) {
                return undefined;
            }

            return oidcCore.getDecodedIdToken();
        });

        const [evtIsDecodedIdTokenUsed] = useState(() => createStatefulEvt<boolean>(() => false));

        useEffect(() => {
            let isActive = true;

            let unsubscribe: (() => void) | undefined = undefined;

            dOidcCoreOrInitializationError.pr.then(async oidcCore => {
                if (!isActive) {
                    return;
                }

                assert(!(oidcCore instanceof OidcInitializationError));

                if (!oidcCore.isUserLoggedIn) {
                    return;
                }

                if (!evtIsDecodedIdTokenUsed.current) {
                    const dDecodedIdTokenUsed = new Deferred<void>();

                    const { unsubscribe } = evtIsDecodedIdTokenUsed.subscribe(isDecodedIdTokenUsed => {
                        if (!isDecodedIdTokenUsed) {
                            return;
                        }
                        unsubscribe();
                        dDecodedIdTokenUsed.resolve();
                    });

                    await dDecodedIdTokenUsed.pr;

                    if (!isActive) {
                        return;
                    }
                }

                reRenderIfDecodedIdTokenChanged(oidcCore.getDecodedIdToken());

                unsubscribe = oidcCore.subscribeToTokensChange(() => {
                    reRenderIfDecodedIdTokenChanged(oidcCore.getDecodedIdToken());
                }).unsubscribe;
            });

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

                    const { unsubscribe } = evtIsAutoLogoutStateUsed.subscribe(isAutoLogoutStateUsed => {
                        if (!isAutoLogoutStateUsed) {
                            return;
                        }
                        unsubscribe();

                        dAutoLogoutStateUsed.resolve();
                    });

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

        if (oidcCore === undefined) {
            return id<UseOidc.Oidc.NotLoggedIn.NotSettledYet>({
                get issuerUri() {
                    const { hasResolved, value: paramsOfBootstrap } = dParamsOfBootstrap.getState();

                    const select = (
                        paramsOfBootstrap: ParamsOfBootstrap<
                            AutoLogin,
                            DecodedIdToken,
                            AccessTokenClaims
                        >
                    ) => {
                        switch (paramsOfBootstrap.implementation) {
                            case "mock": {
                                if (paramsOfBootstrap.issuerUri_mock === undefined) {
                                    throw new Error(
                                        [
                                            "oidc-spa: Cannot access const { issuerUri } = useOidc()",
                                            "oidc is running in mock mode but you didn't provide issuerUri_mock",
                                            "when calling oidcBootstrap({ type: 'mock' })"
                                        ].join(" ")
                                    );
                                }
                                return paramsOfBootstrap.issuerUri_mock;
                            }
                            case "real":
                                return paramsOfBootstrap.issuerUri;
                        }
                    };

                    return hasResolved
                        ? id<PotentiallyDeferred.Resolved<string>>({
                              hasResolved: true,
                              value: select(paramsOfBootstrap)
                          })
                        : id<PotentiallyDeferred.NotResolved<string>>({
                              hasResolved: false,
                              prValue: dParamsOfBootstrap.pr.then(select)
                          });
                },
                get clientId() {
                    const { hasResolved, value: paramsOfBootstrap } = dParamsOfBootstrap.getState();

                    const select = (
                        paramsOfBootstrap: ParamsOfBootstrap<
                            AutoLogin,
                            DecodedIdToken,
                            AccessTokenClaims
                        >
                    ) => {
                        switch (paramsOfBootstrap.implementation) {
                            case "mock": {
                                if (paramsOfBootstrap.clientId_mock === undefined) {
                                    throw new Error(
                                        [
                                            "oidc-spa: Cannot access const { clientId } = useOidc()",
                                            "oidc is running in mock mode but you didn't provide clientId_mock",
                                            "when calling oidcBootstrap({ type: 'mock' })"
                                        ].join(" ")
                                    );
                                }
                                return paramsOfBootstrap.clientId_mock;
                            }
                            case "real":
                                return paramsOfBootstrap.clientId;
                        }
                    };

                    return hasResolved
                        ? id<PotentiallyDeferred.Resolved<string>>({
                              hasResolved: true,
                              value: select(paramsOfBootstrap)
                          })
                        : id<PotentiallyDeferred.NotResolved<string>>({
                              hasResolved: false,
                              prValue: dParamsOfBootstrap.pr.then(select)
                          });
                },
                autoLogoutState: { shouldDisplayWarning: false },
                isUserLoggedIn: undefined,
                login: async params => {
                    const oidcCore = await dOidcCoreOrInitializationError.pr;

                    if (oidcCore instanceof OidcInitializationError || oidcCore.isUserLoggedIn) {
                        return new Promise<never>(() => {});
                    }

                    return oidcCore.login({
                        doesCurrentHrefRequiresAuth: false,
                        ...params
                    });
                }
            });
        }

        if (!oidcCore.isUserLoggedIn) {
            return id<UseOidc.Oidc.NotLoggedIn>({
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

        return id<UseOidc.Oidc.LoggedIn<DecodedIdToken>>({
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

    async function getOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): Promise<GetOidc.Oidc<DecodedIdToken>> {
        if (!isBrowser) {
            throw new Error(
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
            { process: { env: Record<string, string | undefined> } },
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
                dParamsOfBootstrap.resolve(getParamsOfBootstrap({ process }));
                return;
            }

            assert(prModuleCore !== undefined);

            const envNamesToPullFromServer = new Set<string>();

            getParamsOfBootstrap({
                process: {
                    env: new Proxy<Record<string, string>>(
                        {},
                        {
                            get: (...[, envName]) => {
                                assert(typeof envName === "string");

                                envNamesToPullFromServer.add(envName);

                                return "oidc_spa_probe";
                            },
                            has: (...[, envName]) => {
                                assert(typeof envName === "string");

                                envNamesToPullFromServer.add(envName);

                                return true;
                            }
                        }
                    )
                }
            });

            const paramsOfBootstrap = getParamsOfBootstrap({
                process: {
                    env:
                        envNamesToPullFromServer.size === 0
                            ? {}
                            : await fetchServerEnvVariableValues({
                                  data: {
                                      envVarNames: Array.from(envNamesToPullFromServer)
                                  }
                              })
                }
            });

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

                        let oidcCoreOrInitializationError:
                            | Oidc_core<DecodedIdToken>
                            | OidcInitializationError;

                        try {
                            oidcCoreOrInitializationError = await createOidc({
                                homeUrl: infer_import_meta_env_BASE_URL(),
                                autoLogin,
                                decodedIdTokenSchema,
                                issuerUri: paramsOfBootstrap.issuerUri,
                                clientId: paramsOfBootstrap.clientId
                            });
                        } catch (error) {
                            assert(error instanceof OidcInitializationError);
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
            throw new Error(
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

        return children;
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

    async function getTanStackReactStartServerMod() {
        return (await import(
            `@tanstack/react-start/server${Date.now() !== 0 && ""}`
        )) as typeof import("@tanstack/react-start-server");
    }

    function createFunctionMiddlewareServerFn(params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }) {
        return async (options: {
            next: (options: { context: { oidcContext: OidcServerContext<AccessTokenClaims> } }) => any;
        }): Promise<any> => {
            const { next } = options;

            const { getRequest, setResponseHeader, setResponseStatus } =
                await getTanStackReactStartServerMod();

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
                        oidcContext: id<OidcServerContext<AccessTokenClaims>>(
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
                    oidcContext: id<OidcServerContext<AccessTokenClaims>>(
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

    function getOidcRequestMiddleware(params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }) {
        return createMiddleware({ type: "request" }).server<{
            oidcContext: OidcServerContext<AccessTokenClaims>;
        }>(createFunctionMiddlewareServerFn(params));
    }

    function getOidcFnMiddleware(params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: { accessTokenClaims: AccessTokenClaims }) => Promise<boolean>;
    }) {
        return createMiddleware({ type: "function" })
            .client(async ({ next }) => {
                const oidc = await getOidc();

                if (params?.assert === "user logged in" && !oidc.isUserLoggedIn) {
                    throw new Error(
                        [
                            "oidc-spa: You used getOidcFrMiddleware({ assert: 'user logged in' })",
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
                oidcContext: OidcServerContext<AccessTokenClaims>;
            }>(createFunctionMiddlewareServerFn(params));
    }

    // @ts-expect-error
    return {
        useOidc,
        getOidc,
        bootstrapOidc,
        enforceLogin,
        OidcInitializationGate,
        getOidcFnMiddleware,
        getOidcRequestMiddleware
    };
}

const fetchServerEnvVariableValues = createServerFn({ method: "GET" })
    .inputValidator((data: { envVarNames: string[] }) => {
        if (typeof data !== "object" || data === null) {
            throw new Error("Expected an object");
        }

        const { envVarNames } = data as Record<string, unknown>;

        if (!Array.isArray(envVarNames) || envVarNames.some(name => typeof name !== "string")) {
            throw new Error("envVarNames must be an array of strings");
        }

        return { envVarNames };
    })
    .handler(async ({ data }) => {
        const { envVarNames } = data;
        return Object.fromEntries(envVarNames.map(envVarName => [envVarName, process.env[envVarName]]));
    });
