import {
    useState,
    useEffect,
    useReducer,
    createElement,
    type ReactNode,
    type ComponentType
} from "react";
import type { UseOidc, OidcSpaApi, GetOidc, ParamsOfBootstrap } from "./types";
import type { ZodSchemaLike } from "../tools/ZodSchemaLike";
import type { Oidc as Oidc_core } from "../core";
import { OidcInitializationError } from "../core/OidcInitializationError";
import { Deferred } from "../tools/Deferred";
import { isBrowser } from "../tools/isBrowser";
import { assert, type Equals } from "../tools/tsafe/assert";
import { createObjectThatThrowsIfAccessed } from "../tools/createObjectThatThrowsIfAccessed";
import { createStatefulEvt } from "../tools/StatefulEvt";
import { id } from "../tools/tsafe/id";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { setDesiredPostLoginRedirectUrl } from "../core/desiredPostLoginRedirectUrl";

export function createOidcSpaApi<
    AutoLogin extends boolean,
    DecodedIdToken extends Record<string, unknown>
>(params: {
    autoLogin: AutoLogin;
    decodedIdTokenSchema:
        | ZodSchemaLike<Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec, DecodedIdToken>
        | undefined;
    decodedIdToken_mock: DecodedIdToken | undefined;
}): OidcSpaApi<AutoLogin, DecodedIdToken> {
    const { autoLogin, decodedIdTokenSchema, decodedIdToken_mock } = params;

    const dParamsOfBootstrap = new Deferred<ParamsOfBootstrap<AutoLogin, DecodedIdToken>>();

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
        assert?: "user logged in" | "user not logged in";
    }): UseOidc.Oidc<DecodedIdToken> {
        const { assert: assert_params } = params ?? {};

        if (!isBrowser) {
            throw new Error(
                [
                    "oidc-spa: useOidc() can't be used on the server.",
                    "You can prevent this component from rendering on the server",
                    "by wrapping it into <OidcInitializationGate />"
                ].join(" ")
            );
        }

        const { hasResolved, value: oidcCore } = dOidcCoreOrInitializationError.getState();

        if (!hasResolved) {
            throw dOidcCoreOrInitializationError.pr;
        }

        if (oidcCore instanceof OidcInitializationError) {
            throw oidcCore;
        }

        check_assertion: {
            if (assert_params === undefined) {
                break check_assertion;
            }

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
            return id<UseOidc.Oidc.NotLoggedIn>({
                isUserLoggedIn: false,
                initializationError: oidcCore.initializationError,
                issuerUri: oidcCore.params.issuerUri,
                clientId: oidcCore.params.clientId,
                validRedirectUri: oidcCore.params.validRedirectUri,
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
            clientId: oidcCore.params.clientId,
            validRedirectUri: oidcCore.params.validRedirectUri
        });
    }

    async function getOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): Promise<GetOidc.Oidc<DecodedIdToken>> {
        if (!isBrowser) {
            throw new Error("oidc-spa: getOidc() can't be used on the server");
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

    const prModuleCore = !isBrowser ? undefined : import("../core");

    let bootstrapOidc_prResolved: Promise<void> | undefined = undefined;

    const bootstrapOidc = (
        paramsOfBootstrap: ParamsOfBootstrap<AutoLogin, DecodedIdToken>
    ): Promise<void> => {
        if (bootstrapOidc_prResolved !== undefined) {
            return bootstrapOidc_prResolved;
        }

        bootstrapOidc_prResolved = dOidcCoreOrInitializationError.pr.then(() => {});

        (async () => {
            if (!isBrowser) {
                return;
            }

            assert(prModuleCore !== undefined);

            dParamsOfBootstrap.resolve(paramsOfBootstrap);

            switch (paramsOfBootstrap.implementation) {
                case "mock":
                    {
                        const { createMockOidc } = await import("../mock/oidc");

                        const oidcCore = await createMockOidc({
                            BASE_URL: paramsOfBootstrap.BASE_URL,
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
                                BASE_URL: paramsOfBootstrap.BASE_URL,
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
                                autoLogoutParams: paramsOfBootstrap.autoLogoutParams
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

        return bootstrapOidc_prResolved;
    };

    async function enforceLogin(loaderContext: {
        request?: { url?: string };
        cause?: "preload" | string;
        location?: {
            publicHref?: string;
        };
    }): Promise<void | never> {
        if (!isBrowser) {
            throw new Error("oidc-spa: getOidc() can't be used on the server");
        }

        const { cause } = loaderContext;

        const redirectUrl = (() => {
            if (loaderContext.request?.url !== undefined) {
                return toFullyQualifiedUrl({
                    urlish: loaderContext.request.url,
                    doAssertNoQueryParams: false
                });
            }

            if (loaderContext.location?.publicHref !== undefined) {
                return toFullyQualifiedUrl({
                    urlish: loaderContext.location.publicHref,
                    doAssertNoQueryParams: false
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
                    "oidc-spa: User is not yet logged in. This is an expected error, nothing to be addressed."
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

    function OidcInitializationErrorGate(props: {
        errorComponent: ComponentType<{
            oidcInitializationError: OidcInitializationError;
        }>;
        children: ReactNode;
    }): ReactNode {
        const { errorComponent: ErrorComponent, children } = props;

        const { hasResolved, value: oidcCoreOrOidcInitializationError } =
            dOidcCoreOrInitializationError.getState();

        if (!hasResolved) {
            throw dOidcCoreOrInitializationError.pr;
        }

        if (oidcCoreOrOidcInitializationError instanceof OidcInitializationError) {
            const oidcInitializationError = oidcCoreOrOidcInitializationError;

            return createElement(ErrorComponent, { oidcInitializationError });
        }

        return children;
    }

    function OidcInitializationGate(props: { fallback?: ReactNode; children: ReactNode }) {
        const { fallback, children } = props;

        const [isReadyToRender, readyToRender] = useReducer(() => true, false);

        useEffect(() => {
            let isActive = true;

            dOidcCoreOrInitializationError.pr.then(() => {
                if (!isActive) {
                    return;
                }
                readyToRender();
            });

            return () => {
                isActive = false;
            };
        }, []);

        if (!isReadyToRender) {
            return fallback !== undefined ? fallback : null;
        }

        return children;
    }

    function withLoginEnforced<Props extends Record<string, unknown>>(
        component: ComponentType<Props>
    ): (props: Props) => ReactNode {
        const Component = component;

        function ComponentWithLoginEnforced(props: Props) {
            const { hasResolved, value: oidcCore } = dOidcCoreOrInitializationError.getState();

            if (!hasResolved) {
                throw dOidcCoreOrInitializationError.pr;
            }

            if (oidcCore instanceof OidcInitializationError) {
                throw oidcCore;
            }

            if (!oidcCore.isUserLoggedIn) {
                throw oidcCore.login({ doesCurrentHrefRequiresAuth: true });
            }

            return createElement(Component, props);
        }

        ComponentWithLoginEnforced.displayName = `${
            Component.displayName ?? Component.name ?? "Component"
        }WithLoginEnforced`;

        return ComponentWithLoginEnforced;
    }

    // @ts-expect-error
    return {
        bootstrapOidc,
        useOidc,
        getOidc,
        OidcInitializationGate,
        OidcInitializationErrorGate,
        enforceLogin,
        withLoginEnforced
    };
}
