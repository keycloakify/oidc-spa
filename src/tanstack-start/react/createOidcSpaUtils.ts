import { useState, useEffect, useReducer } from "react";
import type {
    CreateValidateAndGetAccessTokenClaims,
    OidcSpaUtils,
    UseOidc,
    GetOidc,
    ParamsOfBootstrap,
    OidcServerContext,
    CreateUser
} from "./types";
import type { ZodSchemaLike } from "../../tools/ZodSchemaLike";
import type { Oidc as Oidc_core } from "../../core";
import { OidcInitializationError } from "../../core/OidcInitializationError";
import { Deferred } from "../../tools/Deferred";
import { isBrowser } from "../../tools/isBrowser";
import { assert, type Equals, is } from "../../tools/tsafe/assert";
import {
    createObjectThatThrowsIfAccessed,
    createObjectWithSomePropertiesThatThrowIfAccessed,
    THROW_IF_ACCESSED
} from "../../tools/createObjectThatThrowsIfAccessed";
import { createStatefulEvt } from "../../tools/StatefulEvt";
import { id } from "../../tools/tsafe/id";
import { typeGuard } from "../../tools/tsafe/typeGuard";
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

export function createOidcSpaUtils<
    AutoLogin extends boolean,
    DecodedIdToken extends Record<string, unknown>,
    User,
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
    createUser: CreateUser<User> | undefined;
    user_mock: User | undefined;
}): OidcSpaUtils<AutoLogin, DecodedIdToken, User, AccessTokenClaims> {
    const {
        autoLogin,
        decodedIdTokenSchema,
        decodedIdToken_mock,
        createValidateAndGetAccessTokenClaims,
        createUser,
        user_mock: user_mock_static
    } = params;

    const dParamsOfBootstrap = new Deferred<
        ParamsOfBootstrap<AutoLogin, DecodedIdToken, User, AccessTokenClaims>
    >();

    const dOidcCoreOrInitializationError = new Deferred<
        Oidc_core<DecodedIdToken, User> | OidcInitializationError
    >();

    const dResultOfGetUserOrInitializationErrorOrUndefined = new Deferred<
        | Awaited<ReturnType<Oidc_core.LoggedIn<DecodedIdToken, User>["getUser"]>>
        | OidcInitializationError
        | undefined
    >();

    const evtAutoLogoutState = createStatefulEvt<
        UseOidc.Oidc.LoggedIn<unknown, unknown>["autoLogoutState"]
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

        const { warnUserSecondsBeforeAutoLogout = 60 } = paramsOfBootstrap;

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
            const newState: UseOidc.Oidc.LoggedIn<unknown, unknown>["autoLogoutState"] = (() => {
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
    }): UseOidc.Oidc<DecodedIdToken, User> {
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
            const [, reRenderIfUserChanged] = useState<User | undefined>(() => {
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

                if (resultOfGetUserOrInitializationErrorOrUndefined instanceof Error) {
                    return;
                }

                if (resultOfGetUserOrInitializationErrorOrUndefined === undefined) {
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

        const [evtIsDecodedIdTokenUsed] = useState(() => createStatefulEvt<boolean>(() => false));
        {
            const [, reRenderIfDecodedIdTokenChanged] = useState<DecodedIdToken | undefined>(() => {
                if (!hasResolved) {
                    return undefined;
                }

                if (oidcCoreOrInitializationError instanceof Error) {
                    return undefined;
                }

                const oidcCore = oidcCoreOrInitializationError;

                if (!oidcCore.isUserLoggedIn) {
                    return undefined;
                }
                return oidcCore.getDecodedIdToken();
            });

            useEffect(() => {
                if (!hasResolved) {
                    return;
                }

                if (oidcCoreOrInitializationError instanceof Error) {
                    return;
                }

                const oidcCore = oidcCoreOrInitializationError;

                if (!oidcCore.isUserLoggedIn) {
                    return;
                }

                let isActive = true;

                let unsubscribe: (() => void) | undefined = undefined;

                (async () => {
                    if (!evtIsDecodedIdTokenUsed.current) {
                        const dDecodedIdTokenUsed = new Deferred<void>();

                        const { unsubscribe: unsubscribe_scope } = evtIsDecodedIdTokenUsed.subscribe(
                            () => {
                                unsubscribe_scope();
                                dDecodedIdTokenUsed.resolve();
                            }
                        );
                        unsubscribe = unsubscribe_scope;

                        await dDecodedIdTokenUsed.pr;

                        if (!isActive) {
                            return;
                        }
                    }

                    reRenderIfDecodedIdTokenChanged(oidcCore.getDecodedIdToken());

                    unsubscribe = oidcCore.subscribeToTokensChange(() => {
                        reRenderIfDecodedIdTokenChanged(oidcCore.getDecodedIdToken());
                    }).unsubscribeFromTokensChange;
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

        const resultOfGetUserOrUndefined = resultOfGetUserOrInitializationErrorOrUndefined;

        const oidc = createObjectWithSomePropertiesThatThrowIfAccessed<
            UseOidc.Oidc.LoggedIn<DecodedIdToken, User>
        >(
            {
                isOidcReady: true,
                isUserLoggedIn: true,
                decodedIdToken: null as any,
                logout: oidcCore.logout,
                renewTokens: oidcCore.renewTokens,
                goToAuthServer: oidcCore.goToAuthServer,
                backFromAuthServer: oidcCore.backFromAuthServer,
                isNewBrowserSession: oidcCore.isNewBrowserSession,
                autoLogoutState: null as any,
                issuerUri: oidcCore.issuerUri,
                clientId: oidcCore.clientId,
                validRedirectUri: oidcCore.validRedirectUri,
                user: resultOfGetUserOrUndefined === undefined ? THROW_IF_ACCESSED : (null as any),
                refreshUser: (() => {
                    if (resultOfGetUserOrUndefined === undefined) {
                        return THROW_IF_ACCESSED;
                    }

                    const resultOfGetUser = resultOfGetUserOrUndefined;

                    return resultOfGetUser.refreshUser;
                })()
            },
            [
                "oidc-spa: You must use oidcSpa.withUser() to implement the user abstraction",
                "See: https://docs.oidc-spa.dev/v/v10/features/user"
            ].join(" ")
        );

        Object.defineProperties(oidc, {
            decodedIdToken: {
                enumerable: true,
                get: () => {
                    evtIsDecodedIdTokenUsed.current = true;
                    return oidcCore.getDecodedIdToken();
                }
            },
            autoLogoutState: {
                enumerable: true,
                get: () => {
                    evtIsAutoLogoutStateUsed.current = true;
                    return evtAutoLogoutState.current;
                }
            }
        });

        if (resultOfGetUserOrUndefined !== undefined) {
            const resultOfGetUser = resultOfGetUserOrUndefined;
            Object.defineProperty(oidc, "user", {
                enumerable: true,
                get: () => {
                    evtIsUserUsed.current = true;
                    return resultOfGetUser.user;
                }
            });
        }

        return oidc;
    }

    async function getOidc(params?: {
        assert?: "user logged in" | "user not logged in" | "init completed";
    }): Promise<GetOidc.Oidc<DecodedIdToken, User>> {
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
            ? id<GetOidc.Oidc.LoggedIn<DecodedIdToken, User>>({
                  issuerUri: oidcCore.issuerUri,
                  clientId: oidcCore.clientId,
                  validRedirectUri: oidcCore.validRedirectUri,
                  isUserLoggedIn: true,
                  getAccessToken: async () => {
                      const { accessToken } = await oidcCore.getTokens();
                      return accessToken;
                  },
                  subscribeToAccessTokenRotation: next => {
                      const { unsubscribeFromTokensChange } = oidcCore.subscribeToTokensChange(
                          ({ accessToken }) => {
                              next(accessToken);
                          }
                      );

                      return { unsubscribeFromAccessTokenRotation: unsubscribeFromTokensChange };
                  },
                  getDecodedIdToken: oidcCore.getDecodedIdToken,
                  subscribeToDecodedIdTokenChange: next => {
                      const current = oidcCore.getDecodedIdToken();

                      const { unsubscribeFromTokensChange } = oidcCore.subscribeToTokensChange(
                          ({ decodedIdToken }) => {
                              // NOTE: oidc-spa/core keeps the reference stable
                              // when structure hasn't changed.
                              if (current !== decodedIdToken) {
                                  next(decodedIdToken);
                              }
                          }
                      );

                      return { unsubscribeFromDecodedIdTokenChange: unsubscribeFromTokensChange };
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
    }

    let hasBootstrapBeenCalled = false;

    const prModuleCore = !isBrowser ? undefined : import("../../core");

    const bootstrapOidc = (
        getParamsOfBootstrapOrDirectValue: GetterOrDirectValue<
            { process: { env: Record<string, string> } },
            ParamsOfBootstrap<AutoLogin, DecodedIdToken, User, AccessTokenClaims>
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
                              User,
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
                        const { createMockOidc } = await import("../../core/createMockOidc");

                        const user_mock = paramsOfBootstrap.user_mock ?? user_mock_static;

                        const oidcCore = await createMockOidc({
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
                            },
                            mockedUser: user_mock
                        });

                        dOidcCoreOrInitializationError.resolve(oidcCore);

                        set_result_of_getUser: {
                            if (user_mock === undefined) {
                                dResultOfGetUserOrInitializationErrorOrUndefined.resolve(undefined);
                                break set_result_of_getUser;
                            }

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

                        const { createOidc } = await prModuleCore;

                        let oidcCoreOrInitializationError:
                            | Oidc_core<DecodedIdToken, User>
                            | OidcInitializationError;

                        try {
                            oidcCoreOrInitializationError = await createOidc({
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
                                sessionRestorationMethod: paramsOfBootstrap.sessionRestorationMethod,
                                debugLogs: paramsOfBootstrap.debugLogs,
                                __unsafe_clientSecret: paramsOfBootstrap.__unsafe_clientSecret,
                                __metadata: paramsOfBootstrap.__metadata,
                                __unsafe_useIdTokenAsAccessToken:
                                    paramsOfBootstrap.__unsafe_useIdTokenAsAccessToken,
                                autoLogoutParams: paramsOfBootstrap.autoLogoutParams,
                                disableDPoP: paramsOfBootstrap.disableDPoP,
                                createUser
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
                            if (createUser === undefined) {
                                dResultOfGetUserOrInitializationErrorOrUndefined.resolve(undefined);
                                break set_result_of_getUser;
                            }

                            if (!oidcCoreOrInitializationError.isUserLoggedIn) {
                                dResultOfGetUserOrInitializationErrorOrUndefined.resolve(undefined);
                                break set_result_of_getUser;
                            }

                            let resultOfGetUser: Awaited<
                                ReturnType<Oidc_core.LoggedIn<DecodedIdToken, User>["getUser"]>
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
        hasRequiredClaims?: (params: {
            accessTokenClaims: AccessTokenClaims;
        }) => MaybeAsync<boolean | undefined>;
    }) {
        return async (options: {
            next: (options: { context: { oidc: OidcServerContext<AccessTokenClaims> } }) => any;
        }): Promise<any> => {
            const { next } = options;

            const createError = (params: {
                code: 400 | 401 | 403;
                wwwAuthenticateResponseHeaderValue: string;
                debugErrorMessage: string;
            }) => {
                const { code, wwwAuthenticateResponseHeaderValue, debugErrorMessage } = params;

                setResponseHeader("WWW-Authenticate", wwwAuthenticateResponseHeaderValue);
                setResponseStatus(
                    code,
                    (() => {
                        switch (code) {
                            case 400:
                                return "Bad Request";
                            case 401:
                                return "Unauthorized";
                            case 403:
                                return "Forbidden";
                            default:
                                assert<Equals<typeof code, never>>(false);
                        }
                    })()
                );

                if (process.env.NODE_ENV === "development") {
                    console.error(`oidc-spa: ${debugErrorMessage}`);
                }

                return new Error(`oidc-spa: ${wwwAuthenticateResponseHeaderValue}`);
            };

            assert(prValidateAndGetAccessTokenClaims !== undefined);

            const { extractRequestAuthContext } = await import("../../server/extractRequestAuthContext");

            const requestAuthContext = extractRequestAuthContext({
                request: getRequest() as Request,
                trustProxy: true
            });

            if (requestAuthContext === undefined) {
                if (params?.assert === "user logged in") {
                    throw createError({
                        code: 401,
                        wwwAuthenticateResponseHeaderValue:
                            'Bearer error="invalid_request", error_description="Missing access token"',
                        debugErrorMessage: [
                            "Asserted user logged in for that serverFn request",
                            "but no access token was attached to the request"
                        ].join(" ")
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

            if (!requestAuthContext.isWellFormed) {
                throw createError({
                    code: 400,
                    wwwAuthenticateResponseHeaderValue:
                        'Bearer error="invalid_request", error_description="Malformed or unsupported request"',
                    debugErrorMessage: requestAuthContext.debugErrorMessage
                });
            }

            const { validateAndGetAccessTokenClaims } = await prValidateAndGetAccessTokenClaims;

            const resultOfValidate = await validateAndGetAccessTokenClaims(
                requestAuthContext.accessTokenAndMetadata
            );

            if (!resultOfValidate.isSuccess) {
                const { debugErrorMessage, wwwAuthenticateResponseHeaderValue } = resultOfValidate;

                throw createError({
                    code: 401,
                    wwwAuthenticateResponseHeaderValue,
                    debugErrorMessage
                });
            }

            const { accessTokenClaims, accessToken } = resultOfValidate;

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

                throw createError({
                    code: 403,
                    wwwAuthenticateResponseHeaderValue:
                        'Bearer error="insufficient_scope", error_description="Insufficient privileges"',
                    debugErrorMessage: [
                        "Missing or invalid required access token claim.",
                        `Related to claims: ${Array.from(accessedClaimNames).join(" and/or ")}`
                    ].join(" ")
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
        hasRequiredClaims?: (params: {
            accessTokenClaims: AccessTokenClaims;
        }) => MaybeAsync<boolean | undefined>;
    }) {
        return createMiddleware({ type: "request" }).server<{
            oidc: OidcServerContext<AccessTokenClaims>;
        }>(createFunctionMiddlewareServerFn(params));
    }

    function oidcFnMiddleware(params?: {
        assert?: "user logged in";
        hasRequiredClaims?: (params: {
            accessTokenClaims: AccessTokenClaims;
        }) => MaybeAsync<boolean | undefined>;
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
        useOidc,
        getOidc,
        bootstrapOidc,
        enforceLogin,
        oidcFnMiddleware,
        oidcRequestMiddleware
    };
}

const fetchServerEnvVariableValues = createServerFn({ method: "GET" })
    .validator((data: { envVarNames: string[] }) => {
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
