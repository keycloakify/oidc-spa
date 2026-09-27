import { useState, useEffect, useLayoutEffect, useReducer } from "react";
import type {
    OidcSpaUtils,
    RuntimeConfigs,
    Oidc_server,
    CreateClientUser,
    CreateServerUser,
    AccessTokenClaims,
    IdTokenClaims,
    Oidc_react,
    Oidc_client
} from "./types";
import type { Oidc as Oidc_core } from "../../core";
import { OidcInitializationError } from "../../core/OidcInitializationError";
import { Deferred } from "../../tools/Deferred";
import { isBrowser } from "../../tools/isBrowser";
import { assert, type Equals, is } from "../../tools/tsafe/assert";
import { createStatefulEvt } from "../../tools/StatefulEvt";
import { id } from "../../tools/tsafe/id";
import type { OptionallyAsyncGetterOrDirectValue } from "../../tools/GetterOrDirectValue";
import { createServerFn, createMiddleware } from "@tanstack/react-start";
// @ts-expect-error: Since our module is not labeled as ESM we don't have the types here.
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
//import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start-server";
import { toFullyQualifiedUrl } from "../../tools/toFullyQualifiedUrl";
import { BEFORE_LOAD_FN_BRAND_PROPERTY_NAME } from "./disableSsrIfLoginEnforced";
import type { MaybeAsync } from "../../tools/MaybeAsync";
import { enableStateDataCookie } from "../../core/StateDataCookie";
import { getBASE_URL_earlyInit } from "../../core/earlyInit_BASE_URL";
import {
    createObjectThatThrowsIfAccessed,
    isObjectThatThrowIfAccessed
} from "../../tools/createObjectThatThrowsIfAccessed";
import { publicEnvNames, toRedactEnvNames } from "virtual:oidc-spa/tanstack-start-public-env";
import { ValidateAndGetAccessTokenClaims } from "../../server";
import * as runExclusive from "../../tools/run-exclusive";

export function createUtils<User_client, User_server, AutoLogin extends boolean>(params: {
    autoLogin: AutoLogin;
    createClientUser: CreateClientUser<User_client>;
    createServerUser: CreateServerUser<User_server> | undefined;
    getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<
        { process: { env: Record<string, string> } },
        RuntimeConfigs<User_client, User_server, AutoLogin>
    >;
}): OidcSpaUtils<User_client, User_server, AutoLogin> {
    const { autoLogin, createClientUser, createServerUser, getRuntimeConfigsOrRuntimeConfigs } = params;

    const getRuntimeConfigs =
        typeof getRuntimeConfigsOrRuntimeConfigs === "function"
            ? getRuntimeConfigsOrRuntimeConfigs
            : () => getRuntimeConfigsOrRuntimeConfigs;

    const dBootstrapClient = new Deferred<void>();

    const dOidcOrInitializationError = new Deferred<Oidc_core<User_client> | OidcInitializationError>();

    const dResultOfGetUserOrInitializationErrorOrUndefined = new Deferred<
        | Awaited<ReturnType<Oidc_core.LoggedIn<User_client>["getUser"]>>
        | OidcInitializationError
        | undefined
    >();

    const evtAutoLogoutState = createStatefulEvt<Oidc_react.LoggedIn<unknown>["autoLogoutState"]>(
        () => ({
            shouldDisplayWarning: false
        })
    );

    dBootstrapClient.pr.then(async () => {
        const runtimeConfigs = await (async () => {
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

            let runtimeConfigs: RuntimeConfigs<User_client, User_server, AutoLogin>;

            try {
                runtimeConfigs = await getRuntimeConfigs({ process: { env: env_server_proxy } });
            } catch (error) {
                dOidcOrInitializationError.resolve(
                    new OidcInitializationError({
                        isAuthServerLikelyDown: false,
                        messageOrCause: new Error(
                            "Error thrown while evaluating the runtime configs getter on the client",
                            // @ts-expect-error
                            { cause: error }
                        )
                    })
                );

                dResultOfGetUserOrInitializationErrorOrUndefined.resolve(undefined);

                await new Promise<never>(() => {});

                assert(false);
            }

            return runtimeConfigs;
        })();

        switch (runtimeConfigs.mode) {
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

                    const clientId_mock = runtimeConfigs.client?.clientId_mock ?? ClIENT_ID_MOCK_DEFAULT;

                    const issuerUri_mock = runtimeConfigs.issuerUri_mock ?? ISSUER_URI_MOCK_DEFAULT;

                    const accessToken_mock =
                        runtimeConfigs.accessToken_mock ?? ACCESS_TOKEN_MOCK_DEFAULT;

                    const idToken_mock = runtimeConfigs.client?.idTokenMock ?? ID_TOKEN_MOCK_DEFAULT;

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

                    const oidc = await createMockOidc_core({
                        // NOTE: The `as false` is lying here, it's just to preserve some level of type-safety.
                        autoLogin: autoLogin as false,
                        isUserInitiallyLoggedIn: runtimeConfigs.client?.isUserInitiallyLoggedIn ?? true,
                        clientId_mock,
                        issuerUri_mock,
                        idToken_mock,
                        idTokenClaims_mock: runtimeConfigs.client?.idTokenClaims_mock,
                        accessToken_mock,
                        refreshToken_mock: runtimeConfigs.client?.refreshToken_mock,
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
                                urlish: getBASE_URL_earlyInit(),
                                doAssertNoQueryParams: true,
                                doOutputWithTrailingSlash: true,
                                rootUrl_fullyQualified: window.location.origin
                            }),
                            user_current: undefined
                        })
                    });

                    dOidcOrInitializationError.resolve(oidc);

                    set_result_of_getUser: {
                        if (!oidc.isUserLoggedIn) {
                            dResultOfGetUserOrInitializationErrorOrUndefined.resolve(undefined);
                            break set_result_of_getUser;
                        }

                        dResultOfGetUserOrInitializationErrorOrUndefined.resolve(await oidc.getUser());
                    }
                }
                break;
            case "real":
                {
                    enableStateDataCookie();

                    const { createOidc } = await import("../../core");

                    let oidcOrInitializationError: Oidc_core<User_client> | OidcInitializationError;

                    try {
                        oidcOrInitializationError = await createOidc<User_client, AutoLogin>({
                            autoLogin,
                            issuerUri: runtimeConfigs.issuerUri,
                            clientId: runtimeConfigs.client.clientId,
                            idleSessionLifetimeInSeconds:
                                runtimeConfigs.client.idleSessionLifetimeInSeconds,
                            scopes: runtimeConfigs.client.scopes,
                            transformAuthorizationUrl: runtimeConfigs.client.transformAuthorizationUrl,
                            authorizationParams: runtimeConfigs.client.authorizationParams,
                            tokenParams: runtimeConfigs.client.tokenParams,
                            sessionRestorationMethod: runtimeConfigs.client.sessionRestorationMethod,
                            debugLogs: runtimeConfigs.debugLogs,
                            __oidcProviderMetadata: runtimeConfigs.client.__oidcProviderMetadata,
                            autoLogout_redirectionTarget:
                                runtimeConfigs.client.autoLogout_redirectionTarget,
                            disableDPoP: runtimeConfigs.client.disableDPoP,
                            warnUserSecondsBeforeAutoLogout:
                                runtimeConfigs.client.warnUserSecondsBeforeAutoLogout,
                            createUser: params =>
                                createClientUser({
                                    isMock: false,
                                    ...params
                                })
                        });
                    } catch (error) {
                        if (!(error instanceof OidcInitializationError)) {
                            throw error;
                        }
                        const initializationError = error;
                        dOidcOrInitializationError.resolve(initializationError);
                        dResultOfGetUserOrInitializationErrorOrUndefined.resolve(initializationError);
                        return;
                    }

                    dOidcOrInitializationError.resolve(oidcOrInitializationError);

                    set_result_of_getUser: {
                        if (!oidcOrInitializationError.isUserLoggedIn) {
                            dResultOfGetUserOrInitializationErrorOrUndefined.resolve(undefined);
                            break set_result_of_getUser;
                        }

                        let resultOfGetUser: Awaited<
                            ReturnType<Oidc_core.LoggedIn<User_client>["getUser"]>
                        >;

                        try {
                            resultOfGetUser = await oidcOrInitializationError.getUser();
                        } catch (error) {
                            dResultOfGetUserOrInitializationErrorOrUndefined.resolve(
                                new OidcInitializationError({
                                    isAuthServerLikelyDown: false,
                                    messageOrCause: new Error(
                                        "The initial invocation of createUser threw an error",
                                        // @ts-expect-error
                                        {
                                            cause: error instanceof Error ? error : new Error(`${error}`)
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
    });

    dOidcOrInitializationError.pr.then(oidcOrInitializationError => {
        if (
            oidcOrInitializationError === undefined ||
            oidcOrInitializationError instanceof OidcInitializationError
        ) {
            return;
        }

        const oidc = oidcOrInitializationError;

        if (!oidc.isUserLoggedIn) {
            return;
        }

        oidc.subscribeToAutoLogoutState(autoLogoutState => {
            evtAutoLogoutState.current = autoLogoutState;
        });
    });

    const useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : useEffect;

    function useOidc(params?: {
        assert?: "user logged in" | "user not logged in" | "ready";
    }): Oidc_react<User_client> {
        useIsomorphicLayoutEffect(() => {
            dBootstrapClient.resolve();
        }, []);

        const { assert: assert_params } = params ?? {};

        const {
            hasResolved,
            oidcOrInitializationError,
            resultOfGetUserOrInitializationErrorOrUndefined
        } = (() => {
            const { hasResolved: hasResolved_oidc, value: oidcOrInitializationError } =
                dOidcOrInitializationError.getState();

            const {
                hasResolved: hasResolved_resultOfGetUser,
                value: resultOfGetUserOrInitializationErrorOrUndefined
            } = dResultOfGetUserOrInitializationErrorOrUndefined.getState();

            if (!hasResolved_resultOfGetUser) {
                return {
                    hasResolved: false as const,
                    oidcOrInitializationError: undefined,
                    resultOfGetUserOrInitializationErrorOrUndefined: undefined
                };
            }

            assert(hasResolved_oidc);

            return {
                hasResolved: true as const,
                oidcOrInitializationError,
                resultOfGetUserOrInitializationErrorOrUndefined
            };
        })();

        check_assertion: {
            if (assert_params === undefined) {
                break check_assertion;
            }

            if (
                !hasResolved ||
                oidcOrInitializationError instanceof Error ||
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

            const oidc = oidcOrInitializationError;

            const getMessage = (v: string) =>
                [
                    "oidc-spa: There is a logic error in the application.",
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

                if (
                    resultOfGetUserOrInitializationErrorOrUndefined === undefined ||
                    resultOfGetUserOrInitializationErrorOrUndefined instanceof Error
                ) {
                    return undefined;
                }

                const resultOfGetUser = resultOfGetUserOrInitializationErrorOrUndefined;

                return resultOfGetUser.user;
            });

            useEffect(() => {
                if (!hasResolved) {
                    return;
                }

                if (
                    resultOfGetUserOrInitializationErrorOrUndefined === undefined ||
                    resultOfGetUserOrInitializationErrorOrUndefined instanceof Error
                ) {
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
            oidcOrInitializationError instanceof Error ||
            resultOfGetUserOrInitializationErrorOrUndefined instanceof Error ||
            hasHydrated === false
        ) {
            return id<Oidc_react.NotReady>({
                isOidcReady: false,
                autoLogoutState: {
                    shouldDisplayWarning: false
                },
                oidcInitializationError: (() => {
                    if (!hasHydrated) {
                        return undefined;
                    }

                    if (hasResolved) {
                        if (oidcOrInitializationError instanceof OidcInitializationError) {
                            const initializationError = oidcOrInitializationError;
                            return initializationError;
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

        const oidc = oidcOrInitializationError;

        if (!oidc.isUserLoggedIn) {
            return id<Oidc_react.NotLoggedIn>({
                isOidcReady: true,
                isUserLoggedIn: false,
                oidcInitializationError: oidc.initializationError,
                issuerUri: oidc.issuerUri,
                clientId: oidc.clientId,
                validRedirectUri: oidc.validRedirectUri,
                autoLogoutState: { shouldDisplayWarning: false },
                login: params =>
                    oidc.login({
                        doesCurrentHrefRequiresAuth: false,
                        ...params
                    })
            });
        }

        assert(resultOfGetUserOrInitializationErrorOrUndefined !== undefined);

        const resultOfGetUser = resultOfGetUserOrInitializationErrorOrUndefined;

        const oidc_react: Oidc_react.LoggedIn<User_client> = {
            isOidcReady: true,
            isUserLoggedIn: true,
            issuerUri: oidc.issuerUri,
            clientId: oidc.clientId,
            validRedirectUri: oidc.validRedirectUri,
            logout: oidc.logout,
            renewTokens: oidc.renewTokens,
            goToAuthServer: oidc.goToAuthServer,
            backFromAuthServer: oidc.backFromAuthServer,
            isNewBrowserSession: oidc.isNewBrowserSession,
            get autoLogoutState() {
                evtIsAutoLogoutStateUsed.current = true;
                return evtAutoLogoutState.current;
            },
            get user() {
                evtIsUserUsed.current = true;
                return resultOfGetUser.user;
            },
            refreshUser: resultOfGetUser.refreshUser
        };

        return oidc_react;
    }

    let redirectUrl_getTokens: string | undefined = undefined;

    let oidc_cached: Oidc_client<User_client> | undefined = undefined;

    async function getOidc(params?: {
        assert?: "user logged in" | "user not logged in" | "init completed";
    }): Promise<Oidc_client<User_client>> {
        if (!isBrowser) {
            throw new Error(
                [
                    "oidc-spa: getOidc() can't be used on the server",
                    "if you use it in a loader, make sure to mark the route",
                    "as `ssr: false`."
                ].join(" ")
            );
        }

        dBootstrapClient.resolve();

        const oidc = await dOidcOrInitializationError.pr;

        if (oidc instanceof OidcInitializationError) {
            return new Promise<never>(() => {});
        }

        if (params?.assert === "user logged in" && !oidc.isUserLoggedIn) {
            throw new Error(
                [
                    "oidc-spa: Called getOidc({ assert: 'user logged in' })",
                    "but the user is not currently logged in."
                ].join(" ")
            );
        }
        if (params?.assert === "user not logged in" && oidc.isUserLoggedIn) {
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

        oidc_cached = (() => {
            if (oidc.isUserLoggedIn) {
                const oidc_proxy = id<Oidc_client.LoggedIn<User_client>>({
                    ...oidc,
                    getTokens: params => {
                        if (params === undefined) {
                            return oidc.getTokens();
                        }
                        return oidc.getTokens({
                            ...params,
                            redirectUrl: params.redirectUrl ?? redirectUrl_getTokens
                        });
                    },
                    getAccessToken: async (params): Promise<string> => {
                        const { accessToken } = await oidc_proxy.getTokens(params);
                        return accessToken;
                    }
                });
                return oidc_proxy;
            } else {
                return oidc;
            }
        })();

        return oidc_cached;
    }

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
                    doAssertNoQueryParams: false,
                    rootUrl_fullyQualified: window.location.origin
                });
            }

            return window.location.href;
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

        set_redirectUrl_getTokens: {
            if (isUrlAlreadyReplaced) {
                break set_redirectUrl_getTokens;
            }

            redirectUrl_getTokens = redirectUrl;

            const history_pushState = history.pushState;
            const history_replaceState = history.replaceState;

            const onNavigated = () => {
                history.pushState = history_pushState;
                history.replaceState = history_replaceState;
                redirectUrl_getTokens = undefined;
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

    const { getLazyServerMaterial } = (() => {
        type R = R_Success | R_Error;

        type R_Success = { isSuccess: true } & (
            | {
                  isMock: true;
                  runtimeConfigs_mock: RuntimeConfigs.Mock<true, AutoLogin>;
              }
            | {
                  isMock: false;
                  enableDebugLogs: boolean;
                  validateAndGetAccessTokenClaims: ValidateAndGetAccessTokenClaims<AccessTokenClaims>;
              }
        );

        type R_Error = {
            isSuccess: false;
        };

        let cachedReturn: R_Success | undefined = undefined;

        const getLazyServerMaterial = runExclusive.build(async (): Promise<R> => {
            if (cachedReturn !== undefined) {
                return cachedReturn;
            }

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

            let runtimeConfigs: RuntimeConfigs<User_client, User_server, AutoLogin>;

            try {
                runtimeConfigs = await getRuntimeConfigs({ process: { env: env_proxy } });
            } catch (error) {
                console.error(`oidc-spa: Error thrown by the getter of runtime configs`, error);
                return { isSuccess: false };
            }

            assert("server" in runtimeConfigs);

            if (
                runtimeConfigs.mode === "real" &&
                (!runtimeConfigs.issuerUri ||
                    (() => {
                        switch (runtimeConfigs.server.accessTokenValidationMethod) {
                            case "introspection endpoint":
                                return (
                                    !runtimeConfigs.server.clientId ||
                                    !runtimeConfigs.server.clientSecret
                                );
                            case "offline JWT validation":
                                return !runtimeConfigs.server.expectedAccessTokenAudience;
                            default:
                                assert<Equals<typeof runtimeConfigs.server, never>>;
                        }
                    })())
            ) {
                throw new Error(
                    [
                        "oidc-spa: Incorrect configuration provided:\n",
                        JSON.stringify(runtimeConfigs, null, 2),
                        ...(missingEnvNames.size === 0
                            ? []
                            : [
                                  "\nYou probably forgot to define the environnement variables:",
                                  Array.from(missingEnvNames).join(", ")
                              ])
                    ].join(" ")
                );
            }

            switch (runtimeConfigs.mode) {
                case "mock": {
                    assert(is<RuntimeConfigs.Mock<true, AutoLogin>>(runtimeConfigs));
                    return {
                        isSuccess: true,
                        isMock: true as const,
                        runtimeConfigs_mock: runtimeConfigs
                    };
                }
                case "real": {
                    assert("server" in runtimeConfigs);

                    const { oidcSpa: oidcSpa_server } = await import("../../server");

                    const { bootstrapAuth, validateAndGetAccessTokenClaims } =
                        oidcSpa_server.createUtils();

                    bootstrapAuth({
                        mode: "real",
                        issuerUri: runtimeConfigs.issuerUri,
                        accessTokenValidation: (() => {
                            switch (runtimeConfigs.server.accessTokenValidationMethod) {
                                case "introspection endpoint":
                                    return {
                                        method: "introspection endpoint",
                                        clientId: runtimeConfigs.server.clientId,
                                        clientSecret: runtimeConfigs.server.clientSecret
                                    };
                                case "offline JWT validation":
                                    return {
                                        method: "offline JWT validation",
                                        expectedAudience:
                                            runtimeConfigs.server.expectedAccessTokenAudience
                                    };
                                default:
                                    assert<Equals<typeof runtimeConfigs.server, never>>(false);
                            }
                        })()
                    });

                    return {
                        isSuccess: true,
                        isMock: false as const,
                        validateAndGetAccessTokenClaims,
                        enableDebugLogs: runtimeConfigs.debugLogs ?? false
                    };
                }
                default:
                    assert<Equals<typeof runtimeConfigs, never>>(false);
            }
        });

        return { getLazyServerMaterial };
    })();

    function createFunctionMiddlewareServerFn(params?: {
        require?: "authed request";
        hasAuthorization?: (params: { user: User_server }) => MaybeAsync<boolean>;
    }) {
        return async (options: {
            next: (options: { context: { oidc: Oidc_server<User_server> } }) => any;
        }): Promise<any> => {
            assert(createServerUser !== undefined);

            const { next } = options;

            const serverMaterial = await getLazyServerMaterial();

            if (!serverMaterial.isSuccess) {
                setResponseStatus(500);
                throw new Error("Internal Server Error");
            }

            if (serverMaterial.isMock) {
                const { runtimeConfigs_mock } = serverMaterial;

                const accessToken_mock =
                    runtimeConfigs_mock.accessToken_mock ??
                    id<typeof import("../../core/createMockOidc").ACCESS_TOKEN_MOCK_DEFAULT>(
                        "mocked-access-token"
                    );

                let user_mock: User_server;

                try {
                    user_mock = await createServerUser({
                        isMock: true,
                        accessToken: accessToken_mock,
                        accessTokenClaims:
                            runtimeConfigs_mock.server?.accessTokenClaims_mock ??
                            createObjectThatThrowsIfAccessed<AccessTokenClaims>({
                                debugMessage: "No accessTokenClaims_mock provided"
                            })
                    });
                } catch (error) {
                    console.error(
                        `oidc-spa: Error thrown while calling createServerUser with mock identity`,
                        error
                    );
                    setResponseStatus(500);
                    throw new Error("Internal Server Error");
                }

                return next({
                    context: {
                        oidc: id<Oidc_server<User_server>>(
                            id<Oidc_server.LoggedIn<User_server>>({
                                isAuthedRequest: true,
                                accessToken: accessToken_mock,
                                user: user_mock
                            })
                        )
                    }
                });
            }

            const { validateAndGetAccessTokenClaims, enableDebugLogs } = serverMaterial;

            const log = (() => {
                if (!enableDebugLogs) {
                    return undefined;
                }

                return id<typeof console.log>((...[first, ...rest]) => {
                    const label = "oidc-spa";

                    if (typeof first === "string") {
                        console.log(...[`${label}: ${first}`, ...rest]);
                    } else {
                        console.log(...[`${label}:`, first, ...rest]);
                    }
                });
            })();

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
                        oidc: id<Oidc_server<User_server>>(
                            id<Oidc_server.NotLoggedIn>({
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

            const {
                isSuccess,
                debugErrorMessage,
                accessToken,
                accessTokenClaims,
                recommendedHttpErrorStatusCode
            } = await validateAndGetAccessTokenClaims(requestAuthContext.accessTokenAndMetadata);

            if (!isSuccess) {
                log?.(debugErrorMessage);
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
                log?.(`oidc-spa: Error thrown while calling createServerUser`, error);
                setResponseStatus(500);
                throw new Error("Internal Server Error");
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
                    log?.(`oidc-spa: Error thrown while calling hasAuthorization`, error);
                    setResponseStatus(500);
                    throw new Error("Internal Server Error");
                }

                if (hasAuthorization) {
                    break check_authorization;
                }

                log?.("Unauthorized request rejected");

                setResponseStatus(403);

                const wwwAuthenticateResponseHeaderValue =
                    'Bearer error="insufficient_scope", error_description="Insufficient privileges"';

                setResponseHeader("WWW-Authenticate", wwwAuthenticateResponseHeaderValue);

                throw new Error(wwwAuthenticateResponseHeaderValue);
            }

            return next({
                context: {
                    oidc: id<Oidc_server<User_server>>(
                        id<Oidc_server.LoggedIn<User_server>>({
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
            oidc: Oidc_server<User_server>;
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
                oidc: Oidc_server<AccessTokenClaims>;
            }>(createFunctionMiddlewareServerFn(params));
    }

    // @ts-expect-error
    return {
        useOidc,
        getOidc,
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
