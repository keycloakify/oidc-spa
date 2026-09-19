import { useState, useEffect, useReducer } from "react";
import type {
    OidcSpaUtils,
    UseOidc,
    GetOidc,
    ParamsOfBootstrap,
    OidcServerContext,
    CreateClientUser,
    CreateServerUser,
    AccessTokenClaims,
    IdTokenClaims
} from "./types";
import type { Oidc as Oidc_core } from "../../core";
import { OidcInitializationError } from "../../core/OidcInitializationError";
import { Deferred } from "../../tools/Deferred";
import { isBrowser } from "../../tools/isBrowser";
import { assert, type Equals } from "../../tools/tsafe/assert";
import { createStatefulEvt } from "../../tools/StatefulEvt";
import { id } from "../../tools/tsafe/id";
import type { GetterOrDirectValue } from "../../tools/GetterOrDirectValue";
import { createServerFn, createMiddleware } from "@tanstack/react-start";
// @ts-expect-error: Since our module is not labeled as ESM we don't have the types here.
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
//import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start-server";
import { toFullyQualifiedUrl } from "../../tools/toFullyQualifiedUrl";
import { BEFORE_LOAD_FN_BRAND_PROPERTY_NAME } from "./disableSsrIfLoginEnforced";
import { setDesiredPostLoginRedirectUrl } from "../../core/desiredPostLoginRedirectUrl";
import type { MaybeAsync } from "../../tools/MaybeAsync";
import { enableStateDataCookie } from "../../core/StateDataCookie";
import { getBASE_URL_earlyInit } from "../../core/earlyInit_BASE_URL";
import {
    createObjectThatThrowsIfAccessed,
    isObjectThatThrowIfAccessed
} from "../../tools/createObjectThatThrowsIfAccessed";
import { publicEnvNames, toRedactEnvNames } from "virtual:oidc-spa/tanstack-start-public-env";

export function createUtils<User_client, User_server, AutoLogin extends boolean>(params: {
    autoLogin: AutoLogin;
    createClientUser: CreateClientUser<User_client>;
    createServerUser: CreateServerUser<User_server> | undefined;
}): OidcSpaUtils<User_client, User_server, AutoLogin> {
    const { autoLogin, createClientUser, createServerUser } = params;

    const dParamsOfBootstrap = new Deferred<ParamsOfBootstrap<User_client, User_server, AutoLogin>>();

    const dOidcCoreOrInitializationError = new Deferred<
        Oidc_core<User_client> | OidcInitializationError
    >();

    const dResultOfGetUserOrInitializationErrorOrUndefined = new Deferred<
        | Awaited<ReturnType<Oidc_core.LoggedIn<User_client>["getUser"]>>
        | OidcInitializationError
        | undefined
    >();

    const evtAutoLogoutState = createStatefulEvt<UseOidc.Oidc.LoggedIn<unknown>["autoLogoutState"]>(
        () => ({
            shouldDisplayWarning: false
        })
    );

    dOidcCoreOrInitializationError.pr.then(oidcCoreOrInitializationError => {
        const { hasResolved, value: paramsOfBootstrap } = dParamsOfBootstrap.getState();

        assert(hasResolved);

        if (paramsOfBootstrap.mode === "mock") {
            return;
        }
        assert<Equals<typeof paramsOfBootstrap.mode, "real">>;

        const { warnUserSecondsBeforeAutoLogout = 60 } = paramsOfBootstrap.client;

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

                if (secondsLeft > warnUserSecondsBeforeAutoLogout) {
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
        assert?: "user logged in" | "user not logged in" | "ready";
    }): UseOidc.Oidc<User_client> {
        const { assert: assert_params } = params ?? {};

        const {
            hasResolved,
            oidcCoreOrInitializationError,
            resultOfGetUserOrInitializationErrorOrUndefined
        } = (() => {
            const { hasResolved: hasResolved_oidcCore, value: oidcCoreOrInitializationError } =
                dOidcCoreOrInitializationError.getState();

            const {
                hasResolved: hasResolved_resultOfGetUser,
                value: resultOfGetUserOrInitializationErrorOrUndefined
            } = dResultOfGetUserOrInitializationErrorOrUndefined.getState();

            if (!hasResolved_resultOfGetUser) {
                return {
                    hasResolved: false as const,
                    oidcCoreOrInitializationError: undefined,
                    resultOfGetUserOrInitializationErrorOrUndefined: undefined
                };
            }

            assert(hasResolved_oidcCore);

            return {
                hasResolved: true as const,
                oidcCoreOrInitializationError,
                resultOfGetUserOrInitializationErrorOrUndefined
            };
        })();

        check_assertion: {
            if (assert_params === undefined) {
                break check_assertion;
            }

            if (
                !hasResolved ||
                oidcCoreOrInitializationError instanceof Error ||
                resultOfGetUserOrInitializationErrorOrUndefined instanceof Error
            ) {
                throw new Error(
                    [
                        "oidc-spa: There is a logic error in the application.",
                        `you called useOidc({ assert: "${assert_params}" }) but`,
                        ...(isBrowser
                            ? [
                                  "the component making this call was rendered before",
                                  "the auth state of the user was established."
                              ]
                            : ["we are on the server, this assertion will always be wrong."]),
                        "\nTo avoid this error make sure to check isOidcReady higher in the tree."
                    ].join(" ")
                );
            }

            if (assert_params === "ready") {
                break check_assertion;
            }

            const oidcCore = oidcCoreOrInitializationError;

            const getMessage = (v: string) =>
                [
                    "oidc-spa: There is a logic error in the application.",
                    `If this component is mounted the user is supposed ${v}.`,
                    "An explicit assertion was made in this sense."
                ].join(" ");

            switch (assert_params) {
                case "user logged in":
                    if (!oidcCore.isUserLoggedIn) {
                        throw new Error(getMessage("to be logged in but currently they arn't"));
                    }
                    break;
                case "user not logged in":
                    if (oidcCore.isUserLoggedIn) {
                        throw new Error(getMessage("not to be logged in but currently they are"));
                    }
                    break;
                default:
                    assert<Equals<typeof assert_params, never>>(false);
            }
        }

        {
            const [, reRender] = useReducer(n => n + 1, 0);

            useEffect(() => {
                if (hasResolved) {
                    return;
                }

                let isActive = true;

                dResultOfGetUserOrInitializationErrorOrUndefined.pr.then(() => {
                    if (!isActive) {
                        return;
                    }
                    reRender();
                });

                return () => {
                    isActive = false;
                };
            }, []);
        }

        const [evtIsUserUsed] = useState(() => createStatefulEvt<boolean>(() => false));
        {
            const [, reRenderIfUserChanged] = useState<User_client | undefined>(() => {
                if (!hasResolved) {
                    return undefined;
                }

                if (resultOfGetUserOrInitializationErrorOrUndefined === undefined) {
                    return undefined;
                }

                if (resultOfGetUserOrInitializationErrorOrUndefined instanceof Error) {
                    return undefined;
                }

                return resultOfGetUserOrInitializationErrorOrUndefined.user;
            });

            useEffect(() => {
                if (!hasResolved) {
                    return;
                }

                if (resultOfGetUserOrInitializationErrorOrUndefined === undefined) {
                    return;
                }

                if (resultOfGetUserOrInitializationErrorOrUndefined instanceof Error) {
                    return;
                }

                const resultOfGetUser = resultOfGetUserOrInitializationErrorOrUndefined;

                let isActive = true;
                let unsubscribe: (() => void) | undefined = undefined;

                (async () => {
                    if (!evtIsUserUsed.current) {
                        const dUserUsed = new Deferred<void>();

                        const { unsubscribe: unsubscribe_scope } = evtIsUserUsed.subscribe(() => {
                            unsubscribe_scope();
                            dUserUsed.resolve();
                        });
                        unsubscribe = unsubscribe_scope;

                        await dUserUsed.pr;

                        if (!isActive) {
                            return;
                        }
                    }

                    reRenderIfUserChanged(resultOfGetUser.user);

                    unsubscribe = resultOfGetUser.subscribeToUserChange(({ user }) => {
                        reRenderIfUserChanged(user);
                    }).unsubscribeFromUserChange;
                })();

                return () => {
                    isActive = false;
                    unsubscribe?.();
                };
            }, [hasResolved]);
        }

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

        const [hasHydrated, setHasHydratedToTrue] = useReducer(
            () => true,
            assert_params !== undefined ? undefined : false
        );

        useEffect(() => {
            if (hasHydrated === undefined) {
                return;
            }
            setHasHydratedToTrue();
        }, []);

        if (
            !hasResolved ||
            oidcCoreOrInitializationError instanceof Error ||
            resultOfGetUserOrInitializationErrorOrUndefined instanceof Error ||
            hasHydrated === false
        ) {
            return id<UseOidc.Oidc.NotReady>({
                isOidcReady: false,
                autoLogoutState: {
                    shouldDisplayWarning: false
                },
                oidcInitializationError: (() => {
                    if (!hasHydrated) {
                        return undefined;
                    }

                    if (hasResolved) {
                        if (oidcCoreOrInitializationError instanceof OidcInitializationError) {
                            const error = oidcCoreOrInitializationError;
                            return error;
                        }
                        if (
                            resultOfGetUserOrInitializationErrorOrUndefined instanceof
                            OidcInitializationError
                        ) {
                            const error = resultOfGetUserOrInitializationErrorOrUndefined;
                            return error;
                        }
                    }

                    return undefined;
                })()
            });
        }

        const oidcCore = oidcCoreOrInitializationError;

        if (!oidcCore.isUserLoggedIn) {
            return id<UseOidc.Oidc.NotLoggedIn>({
                isOidcReady: true,
                isUserLoggedIn: false,
                oidcInitializationError: oidcCore.initializationError,
                issuerUri: oidcCore.issuerUri,
                clientId: oidcCore.clientId,
                validRedirectUri: oidcCore.validRedirectUri,
                autoLogoutState: { shouldDisplayWarning: false },
                login: params =>
                    oidcCore.login({
                        doesCurrentHrefRequiresAuth: false,
                        ...params
                    })
            });
        }

        assert(resultOfGetUserOrInitializationErrorOrUndefined !== undefined);

        const resultOfGetUser = resultOfGetUserOrInitializationErrorOrUndefined;

        const oidc: UseOidc.Oidc.LoggedIn<User_client> = {
            isOidcReady: true,
            isUserLoggedIn: true,
            logout: oidcCore.logout,
            renewTokens: oidcCore.renewTokens,
            goToAuthServer: oidcCore.goToAuthServer,
            backFromAuthServer: oidcCore.backFromAuthServer,
            isNewBrowserSession: oidcCore.isNewBrowserSession,
            get autoLogoutState() {
                evtIsAutoLogoutStateUsed.current = true;
                return evtAutoLogoutState.current;
            },
            issuerUri: oidcCore.issuerUri,
            clientId: oidcCore.clientId,
            validRedirectUri: oidcCore.validRedirectUri,
            get user() {
                evtIsUserUsed.current = true;
                return resultOfGetUser.user;
            },
            refreshUser: resultOfGetUser.refreshUser
        };

        return oidc;
    }

    let oidc_cached: GetOidc.Oidc<User_client> | undefined = undefined;

    async function getOidc(params?: {
        assert?: "user logged in" | "user not logged in" | "init completed";
    }): Promise<GetOidc.Oidc<User_client>> {
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

        if (oidc_cached !== undefined) {
            return oidc_cached;
        }

        oidc_cached = oidcCore.isUserLoggedIn
            ? id<GetOidc.Oidc.LoggedIn<User_client>>({
                  issuerUri: oidcCore.issuerUri,
                  clientId: oidcCore.clientId,
                  validRedirectUri: oidcCore.validRedirectUri,
                  isUserLoggedIn: true,
                  getAccessToken: async () => {
                      const { accessToken } = await oidcCore.getTokens();
                      return accessToken;
                  },
                  subscribeAccessTokenRotation: next => {
                      const { unsubscribeFromTokensChange } = oidcCore.subscribeToTokensChange(
                          ({ accessToken }) => {
                              next({ accessToken });
                          }
                      );

                      return { unsubscribeFromAccessTokenRotation: unsubscribeFromTokensChange };
                  },
                  logout: oidcCore.logout,
                  renewTokens: oidcCore.renewTokens,
                  goToAuthServer: oidcCore.goToAuthServer,
                  backFromAuthServer: oidcCore.backFromAuthServer,
                  isNewBrowserSession: oidcCore.isNewBrowserSession,
                  subscribeToAutoLogoutState: next => {
                      next(evtAutoLogoutState.current);

                      const { unsubscribe } = evtAutoLogoutState.subscribe(next);

                      return { unsubscribeFromAutoLogoutState: unsubscribe };
                  },
                  getUser: oidcCore.getUser
              })
            : id<GetOidc.Oidc.NotLoggedIn>({
                  issuerUri: oidcCore.issuerUri,
                  clientId: oidcCore.clientId,
                  validRedirectUri: oidcCore.validRedirectUri,
                  isUserLoggedIn: false,
                  initializationError: oidcCore.initializationError,
                  login: oidcCore.login
              });

        return oidc_cached;
    }

    let hasBootstrapBeenCalled = false;

    const prModuleCore = !isBrowser ? undefined : import("../../core");

    const bootstrapOidc = (
        getParamsOfBootstrapOrDirectValue: GetterOrDirectValue<
            { process: { env: Record<string, string> } },
            ParamsOfBootstrap<User_client, User_server, AutoLogin>
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

                            if (!value) {
                                missingEnvNames.add(envName);
                            }

                            return value;
                        },
                        has: (...[, envName]) => {
                            assert(typeof envName === "string");
                            return envName in process.env;
                        }
                    }
                );

                const paramsOfBootstrap = getParamsOfBootstrap({ process: { env: env_proxy } });

                if (
                    paramsOfBootstrap.mode === "real" &&
                    (!paramsOfBootstrap.issuerUri || !paramsOfBootstrap.client.clientId)
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
                class OidcSpaServerEnvRetrievalError extends Error {
                    constructor(params: { envName: string }) {
                        super(`oidc-spa: Env value ${params.envName} couldn't be pulled from server`);
                        Object.setPrototypeOf(this, new.target.prototype);
                    }
                }

                const env_server_proxy = new Proxy(
                    publicEnvNames.size === 0 && toRedactEnvNames.size === 0
                        ? {}
                        : await fetchServerEnvVariableValues(),
                    {
                        get: (target, envName) => {
                            assert(typeof envName === "string");

                            if (!(envName in target)) {
                                throw new OidcSpaServerEnvRetrievalError({ envName });
                            }

                            return target[envName] ?? undefined;
                        },
                        has: (target, envName) => {
                            assert(typeof envName === "string");

                            if (!(envName in target)) {
                                throw new OidcSpaServerEnvRetrievalError({ envName });
                            }

                            return target[envName] !== null;
                        }
                    }
                ) as Record<string, string>;

                let paramsOfBootstrap: ParamsOfBootstrap<User_client, User_server, AutoLogin>;

                try {
                    paramsOfBootstrap = getParamsOfBootstrap({ process: { env: env_server_proxy } });
                } catch (error) {
                    if (error instanceof OidcSpaServerEnvRetrievalError) {
                        throw error;
                    }

                    throw new Error(
                        [
                            "oidc-spa: The function argument passed to bootstrapOidc",
                            "has thrown when invoked."
                        ].join(" "),
                        //@ts-expect-error
                        { cause: error }
                    );
                }

                return paramsOfBootstrap;
            })();

            dParamsOfBootstrap.resolve(paramsOfBootstrap);

            switch (paramsOfBootstrap.mode) {
                case "mock":
                    {
                        const [
                            {
                                createMockOidc: createMockOidc_core,
                                ACCESS_TOKEN_MOCK_DEFAULT,
                                ClIENT_ID_MOCK_DEFAULT,
                                ID_TOKEN_MOCK_DEFAULT,
                                ISSUER_URI_MOCK_DEFAULT
                            },
                            { decodeJwt }
                        ] = await Promise.all([
                            import("../../core/createMockOidc"),
                            import("../../tools/decodeJwt")
                        ]);

                        const clientId_mock =
                            paramsOfBootstrap.client?.clientId_mock ?? ClIENT_ID_MOCK_DEFAULT;

                        const issuerUri_mock =
                            paramsOfBootstrap.issuerUri_mock ?? ISSUER_URI_MOCK_DEFAULT;

                        const accessToken_mock =
                            paramsOfBootstrap.accessToken_mock ?? ACCESS_TOKEN_MOCK_DEFAULT;

                        const idToken_mock = ID_TOKEN_MOCK_DEFAULT;

                        const idTokenClaims_mock = (() => {
                            if (idToken_mock !== undefined) {
                                try {
                                    return decodeJwt<IdTokenClaims>(idToken_mock);
                                } catch {}
                            }

                            return createObjectThatThrowsIfAccessed<IdTokenClaims>({
                                debugMessage: [
                                    "You haven't provided a mocked decodedIdToken",
                                    "See https://docs.oidc-spa.dev/v/v10/integration-guides/usage#mock-adapter"
                                ].join("\n")
                            });
                        })();

                        const oidcCore = await createMockOidc_core({
                            // NOTE: The `as false` is lying here, it's just to preserve some level of type-safety.
                            autoLogin: autoLogin as false,
                            isUserInitiallyLoggedIn:
                                paramsOfBootstrap.client?.isUserInitiallyLoggedIn ?? true,
                            clientId_mock,
                            issuerUri_mock,
                            idToken_mock,
                            decodedIdToken_mock: paramsOfBootstrap.client?.idTokenClaims_mock,
                            accessToken_mock,
                            user_mock: await createClientUser({
                                isMock: true,
                                idTokenClaims: idTokenClaims_mock,
                                accessToken: accessToken_mock,
                                fetchUserInfo: async () => {
                                    if (isObjectThatThrowIfAccessed(idTokenClaims_mock)) {
                                        throw new Error("Can't use fetchUserInfo in mockMode");
                                    }
                                    return idTokenClaims_mock;
                                },
                                issuerUri: issuerUri_mock,
                                clientId: clientId_mock,
                                validRedirectUri: toFullyQualifiedUrl({
                                    urlish: (() => {
                                        const BASE_URL = getBASE_URL_earlyInit();

                                        assert(BASE_URL !== undefined);

                                        return BASE_URL;
                                    })(),
                                    doAssertNoQueryParams: true,
                                    doOutputWithTrailingSlash: true
                                }),
                                user_current: undefined
                            })
                        });

                        dOidcCoreOrInitializationError.resolve(oidcCore);

                        set_result_of_getUser: {
                            if (!oidcCore.isUserLoggedIn) {
                                dResultOfGetUserOrInitializationErrorOrUndefined.resolve(undefined);
                                break set_result_of_getUser;
                            }

                            dResultOfGetUserOrInitializationErrorOrUndefined.resolve(
                                await oidcCore.getUser()
                            );
                        }
                    }
                    break;
                case "real":
                    {
                        enableStateDataCookie();

                        const { createOidc: createOidc_core } = await prModuleCore;

                        let oidcCoreOrInitializationError:
                            | Oidc_core<User_client>
                            | OidcInitializationError;

                        try {
                            oidcCoreOrInitializationError = await createOidc_core<
                                User_client,
                                AutoLogin
                            >({
                                autoLogin,
                                issuerUri: paramsOfBootstrap.issuerUri,
                                clientId: paramsOfBootstrap.client.clientId,
                                idleSessionLifetimeInSeconds:
                                    paramsOfBootstrap.client.idleSessionLifetimeInSeconds,
                                scopes: paramsOfBootstrap.client.scopes,
                                transformUrlBeforeRedirect:
                                    paramsOfBootstrap.client.transformUrlBeforeRedirect,
                                extraQueryParams: paramsOfBootstrap.client.extraQueryParams,
                                extraTokenParams: paramsOfBootstrap.client.extraTokenParams,
                                sessionRestorationMethod:
                                    paramsOfBootstrap.client.sessionRestorationMethod,
                                debugLogs: paramsOfBootstrap.debugLogs,
                                __unsafe_clientSecret: paramsOfBootstrap.client.__unsafe_clientSecret,
                                __metadata: paramsOfBootstrap.client.__metadata,
                                __unsafe_useIdTokenAsAccessToken:
                                    paramsOfBootstrap.client.__unsafe_useIdTokenAsAccessToken,
                                autoLogoutParams: paramsOfBootstrap.client.autoLogoutParams,
                                disableDPoP: paramsOfBootstrap.client.disableDPoP,
                                createUser: ({ decodedIdToken, ...params }) =>
                                    createClientUser({
                                        isMock: false,
                                        ...params,
                                        idTokenClaims: decodedIdToken
                                    })
                            });
                        } catch (error) {
                            if (!(error instanceof OidcInitializationError)) {
                                throw error;
                            }
                            dOidcCoreOrInitializationError.resolve(error);
                            dResultOfGetUserOrInitializationErrorOrUndefined.resolve(error);
                            return;
                        }

                        dOidcCoreOrInitializationError.resolve(oidcCoreOrInitializationError);

                        set_result_of_getUser: {
                            if (!oidcCoreOrInitializationError.isUserLoggedIn) {
                                dResultOfGetUserOrInitializationErrorOrUndefined.resolve(undefined);
                                break set_result_of_getUser;
                            }

                            let resultOfGetUser: Awaited<
                                ReturnType<Oidc_core.LoggedIn<User_client>["getUser"]>
                            >;

                            try {
                                resultOfGetUser = await oidcCoreOrInitializationError.getUser();
                            } catch (error) {
                                dResultOfGetUserOrInitializationErrorOrUndefined.resolve(
                                    new OidcInitializationError({
                                        isAuthServerLikelyDown: false,
                                        messageOrCause: new Error(
                                            "The initial invocation of createUser threw an error",
                                            // @ts-expect-error
                                            {
                                                cause:
                                                    error instanceof Error
                                                        ? error
                                                        : new Error(`${error}`)
                                            }
                                        )
                                    })
                                );
                                break set_result_of_getUser;
                            }

                            dResultOfGetUserOrInitializationErrorOrUndefined.resolve(resultOfGetUser);

                            resultOfGetUser.subscribeToUserChange(({ user }) => {
                                resultOfGetUser.user = user;
                            });
                        }
                    }
                    break;
            }
        })();
    };

    async function enforceLogin(loaderContext: {
        cause: "preload" | string;
        location: {
            publicHref: string;
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
            if (loaderContext.location?.publicHref !== undefined) {
                return toFullyQualifiedUrl({
                    urlish: loaderContext.location.publicHref,
                    doAssertNoQueryParams: false
                });
            }

            return location.href;
        })();

        const oidc = await getOidc();

        const isUrlAlreadyReplaced =
            window.location.href.replace(/\/$/, "") === redirectUrl.replace(/\/$/, "");

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

            await oidc.login({
                redirectUrl,
                doesCurrentHrefRequiresAuth: isUrlAlreadyReplaced
            });
        }

        define_temporary_postLoginRedirectUrl: {
            if (isUrlAlreadyReplaced) {
                break define_temporary_postLoginRedirectUrl;
            }

            setDesiredPostLoginRedirectUrl({ postLoginRedirectUrl: redirectUrl });

            const history_pushState = history.pushState;
            const history_replaceState = history.replaceState;

            const onNavigated = () => {
                history.pushState = history_pushState;
                history.replaceState = history_replaceState;
                setDesiredPostLoginRedirectUrl({ postLoginRedirectUrl: undefined });
            };

            history.pushState = function pushState(...args) {
                onNavigated();
                return history_pushState.call(history, ...args);
            };

            history.replaceState = function replaceState(...args) {
                onNavigated();
                return history_replaceState.call(history, ...args);
            };
        }
    }

    enforceLogin[BEFORE_LOAD_FN_BRAND_PROPERTY_NAME] = true;

    const prValidateAndGetAccessTokenClaims = isBrowser
        ? undefined
        : dParamsOfBootstrap.pr.then(async paramsOfBootstrap => {
              if (paramsOfBootstrap.mode === "mock") {
                  return undefined;
              }

              assert<Equals<(typeof paramsOfBootstrap)["mode"], "real">>;

              const { oidcSpa: oidcSpa_server } = await import("../../server");

              const { bootstrapAuth, validateAndGetAccessTokenClaims } = oidcSpa_server.createUtils();

              bootstrapAuth({
                  mode: "real",
                  issuerUri: paramsOfBootstrap.issuerUri,
                  accessTokenValidation: (() => {
                      switch (paramsOfBootstrap.server.accessTokenValidationMethod) {
                          case "introspection endpoint":
                              return {
                                  method: "introspection endpoint",
                                  clientId: paramsOfBootstrap.server.clientId,
                                  clientSecret: paramsOfBootstrap.server.clientSecret
                              };
                          case "offline JWT validation":
                              return {
                                  method: "offline JWT validation",
                                  expectedAudience: paramsOfBootstrap.server.expectedAccessTokenAudience
                              };
                          default:
                              assert<Equals<typeof paramsOfBootstrap.server, never>>(false);
                      }
                  })()
              });

              return validateAndGetAccessTokenClaims;
          });

    function createFunctionMiddlewareServerFn(params?: {
        require?: "authed request";
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }) {
        return async (options: {
            next: (options: { context: { oidc: OidcServerContext<User_server> } }) => any;
        }): Promise<any> => {
            assert(prValidateAndGetAccessTokenClaims !== undefined);
            assert(createServerUser !== undefined);

            const { next } = options;

            const paramsOfBootstrap = await dParamsOfBootstrap.pr;

            if (paramsOfBootstrap.mode === "mock") {
                const accessToken_mock =
                    paramsOfBootstrap.accessToken_mock ??
                    id<typeof import("../../core/createMockOidc").ACCESS_TOKEN_MOCK_DEFAULT>(
                        "mocked-access-token"
                    );

                let user_mock: User_server;

                try {
                    user_mock = await createServerUser({
                        isMock: true,
                        accessToken: accessToken_mock,
                        accessTokenClaims:
                            paramsOfBootstrap.server?.accessTokenClaims_mock ??
                            createObjectThatThrowsIfAccessed<AccessTokenClaims>({
                                debugMessage: "No accessTokenClaims_mock provided"
                            })
                    });
                } catch (error) {
                    setResponseStatus(500);
                    throw error;
                }

                return next({
                    context: {
                        oidc: id<OidcServerContext<User_server>>(
                            id<OidcServerContext.LoggedIn<User_server>>({
                                isAuthedRequest: true,
                                accessToken: accessToken_mock,
                                user: user_mock
                            })
                        )
                    }
                });
            }

            assert<Equals<(typeof paramsOfBootstrap)["mode"], "real">>;

            const { extractRequestAuthContext } = await import("../../server/extractRequestAuthContext");

            const requestAuthContext = extractRequestAuthContext({
                request: getRequest() as Request,
                trustProxy: true
            });

            if (requestAuthContext === undefined) {
                if (params?.require === "authed request") {
                    const wwwAuthenticateResponseHeaderValue =
                        'Bearer error="invalid_request", error_description="Missing access token"';
                    setResponseHeader("WWW-Authenticate", wwwAuthenticateResponseHeaderValue);
                    setResponseStatus(401, "Unauthorized");
                    throw new Error(wwwAuthenticateResponseHeaderValue);
                }
                return next({
                    context: {
                        oidc: id<OidcServerContext<User_server>>(
                            id<OidcServerContext.NotLoggedIn>({
                                isAuthedRequest: false
                            })
                        )
                    }
                });
            }

            if (!requestAuthContext.isWellFormed) {
                const wwwAuthenticateResponseHeaderValue =
                    'Bearer error="invalid_request", error_description="Malformed or unsupported request"';
                setResponseHeader("WWW-Authenticate", wwwAuthenticateResponseHeaderValue);
                setResponseStatus(400, "Bad Request");
                throw new Error(wwwAuthenticateResponseHeaderValue);
            }

            const validateAndGetAccessTokenClaims = await prValidateAndGetAccessTokenClaims;

            assert(validateAndGetAccessTokenClaims !== undefined);

            const { isSuccess, accessToken, accessTokenClaims, recommendedHttpErrorStatusCode } =
                await validateAndGetAccessTokenClaims(requestAuthContext.accessTokenAndMetadata);

            if (!isSuccess) {
                setResponseStatus(recommendedHttpErrorStatusCode);

                const wwwAuthenticateResponseHeaderValue = `Bearer error="invalid_request", error_description="${(() => {
                    switch (recommendedHttpErrorStatusCode) {
                        case 401:
                            return "Invalid token";
                        case 500:
                            return "Internal server error";
                        case 503:
                            return "Retry later";
                    }
                })()}"`;
                setResponseHeader("WWW-Authenticate", wwwAuthenticateResponseHeaderValue);
                throw new Error(wwwAuthenticateResponseHeaderValue);
            }

            let user: User_server;

            try {
                user = await createServerUser({
                    isMock: false,
                    accessToken,
                    accessTokenClaims
                });
            } catch (error) {
                setResponseStatus(500);
                throw error;
            }

            check_authorization: {
                const getHasAuthorization = params?.hasAuthorization;

                if (getHasAuthorization === undefined) {
                    break check_authorization;
                }

                let hasAuthorization: boolean;

                try {
                    hasAuthorization = await getHasAuthorization({ user });
                } catch (error) {
                    setResponseStatus(500);
                    throw error;
                }

                if (hasAuthorization) {
                    break check_authorization;
                }

                setResponseStatus(403);

                const wwwAuthenticateResponseHeaderValue =
                    'Bearer error="insufficient_scope", error_description="Insufficient privileges"';

                setResponseHeader("WWW-Authenticate", wwwAuthenticateResponseHeaderValue);

                throw new Error(wwwAuthenticateResponseHeaderValue);
            }

            return next({
                context: {
                    oidc: id<OidcServerContext<User_server>>(
                        id<OidcServerContext.LoggedIn<User_server>>({
                            isAuthedRequest: true,
                            accessToken,
                            user
                        })
                    )
                }
            });
        };
    }

    function oidcRequestMiddleware(params?: {
        require?: "authed request";
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }) {
        return createMiddleware({ type: "request" }).server<{
            oidc: OidcServerContext<User_server>;
        }>(createFunctionMiddlewareServerFn(params));
    }

    function oidcFnMiddleware(params?: {
        require?: "authed request";
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }) {
        return createMiddleware({ type: "function" })
            .client(async ({ next }) => {
                const oidc = await getOidc();

                if (params?.require === "authed request" && !oidc.isUserLoggedIn) {
                    throw new Error(
                        [
                            "oidc-spa: You used oidcFnMiddleware({ require: 'authed request' })",
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
        useOidc,
        getOidc,
        bootstrapOidc,
        enforceLogin,
        oidcFnMiddleware,
        oidcRequestMiddleware
    };
}

const fetchServerEnvVariableValues = createServerFn({ method: "GET" }).handler(async () => ({
    ...Object.fromEntries(
        Array.from(publicEnvNames).map(envVarName => [envVarName, process.env[envVarName] ?? null])
    ),
    ...Object.fromEntries(
        Array.from(toRedactEnvNames).map(envVarName => [envVarName, "redacted on client"])
    )
}));
