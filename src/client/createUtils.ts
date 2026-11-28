import type { OidcSpaUtils, RuntimeConfigs, CreateClientUser, Oidc } from "./types";
import { OidcInitializationError } from "../core/OidcInitializationError";
import { Deferred } from "../tools/Deferred";
import { isBrowser } from "../tools/isBrowser";
import { assert } from "../tools/tsafe/assert";
import { id } from "../tools/tsafe/id";
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { getHomeUrlAndValidRedirectUri } from "../core/earlyInit_homeUrlAndValidRedirectUri";

export function createUtils<User>(params: {
    createClientUser: CreateClientUser<User>;
    getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>;
}): OidcSpaUtils<User> {
    const getRuntimeConfigs = (() => {
        const { getRuntimeConfigsOrRuntimeConfigs } = params;

        if (typeof getRuntimeConfigsOrRuntimeConfigs === "function") {
            const getRuntimeConfigs = getRuntimeConfigsOrRuntimeConfigs;

            return getRuntimeConfigs;
        } else {
            const runtimeConfigs = getRuntimeConfigsOrRuntimeConfigs;

            return () => runtimeConfigs;
        }
    })();

    const { createClientUser } = params;

    const dClientCtx = new Deferred<
        | {
              doWeHaveOidcInstance: false;
              runtimeConfigs:
                  | {
                        issuerUri: string;
                        clientId: string;
                    }
                  | undefined;
              oidcInitializationError: OidcInitializationError;
          }
        | {
              doWeHaveOidcInstance: true;
              isUserLoggedIn: false;
              oidc: Oidc.NotLoggedIn;
          }
        | {
              doWeHaveOidcInstance: true;
              isUserLoggedIn: true;
              oidc: Oidc.LoggedIn<User>;
          }
    >();

    dClientCtx.pr.then(
        ctx => {
            if (!ctx.doWeHaveOidcInstance) {
                console.error(`oidc-spa: ${ctx.oidcInitializationError}`, ctx.oidcInitializationError);
            }
        },
        // Unexpected initialization errors are handled by the existing callers.
        () => {}
    );

    const { triggerClientInitializationIfNotAlreadyDone } = (() => {
        const d = new Deferred<void>();

        d.pr.then(async () => {
            const runtimeConfigs = await (async () => {
                let runtimeConfigs: RuntimeConfigs;

                try {
                    runtimeConfigs = await getRuntimeConfigs();
                } catch (error) {
                    dClientCtx.resolve({
                        doWeHaveOidcInstance: false,
                        runtimeConfigs: undefined,
                        oidcInitializationError: new OidcInitializationError({
                            isAuthServerLikelyDown: false,
                            messageOrCause: new Error(
                                "Error while loading runtime configs on the client",
                                // @ts-expect-error
                                { cause: error }
                            )
                        })
                    });

                    await new Promise<never>(() => {});

                    assert(false);
                }

                return runtimeConfigs;
            })();

            switch (runtimeConfigs.mode) {
                case "mock":
                    {
                        const { createMockOidc } = await import("../core/createMockOidc");

                        const oidc = await createMockOidc<User>({
                            createUser_mock: params =>
                                createClientUser({
                                    isMock: true,
                                    ...params
                                }),
                            isUserInitiallyLoggedIn: runtimeConfigs.isUserInitiallyLoggedIn ?? true,

                            issuerUri_mock: runtimeConfigs.issuerUri_mock,
                            clientId_mock: runtimeConfigs.clientId_mock,
                            idTokenClaims_mock: runtimeConfigs.idTokenClaims_mock,
                            idToken_mock: runtimeConfigs.idToken_mock,
                            accessToken_mock: runtimeConfigs.accessToken_mock,
                            refreshToken_mock: runtimeConfigs.refreshToken_mock
                        });

                        if (!oidc.isUserLoggedIn) {
                            dClientCtx.resolve({
                                doWeHaveOidcInstance: true,
                                isUserLoggedIn: false,
                                oidc
                            });
                            break;
                        }

                        dClientCtx.resolve({
                            doWeHaveOidcInstance: true,
                            isUserLoggedIn: true,
                            oidc
                        });
                    }
                    break;
                case "real":
                    {
                        const { createOidc } = await import("../core");

                        let oidc: Oidc<User>;

                        try {
                            oidc = await createOidc<User>({
                                issuerUri: runtimeConfigs.issuerUri,
                                clientId: runtimeConfigs.clientId,
                                idleSessionLifetimeInSeconds:
                                    runtimeConfigs.idleSessionLifetimeInSeconds,
                                scopes: runtimeConfigs.scopes,
                                transformAuthorizationUrl: runtimeConfigs.transformAuthorizationUrl,
                                authorizationParams: runtimeConfigs.authorizationParams,
                                tokenParams: runtimeConfigs.tokenParams,
                                sessionRestorationMethod: runtimeConfigs.sessionRestorationMethod,
                                debugLogs: runtimeConfigs.debugLogs,
                                __oidcProviderMetadata: runtimeConfigs.__oidcProviderMetadata,
                                autoLogout_returnToUrl: runtimeConfigs.autoLogout_returnToUrl,
                                disableDPoP: runtimeConfigs.disableDPoP,
                                warnUserSecondsBeforeAutoLogout:
                                    runtimeConfigs.warnUserSecondsBeforeAutoLogout,
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

                            dClientCtx.resolve({
                                doWeHaveOidcInstance: false,
                                runtimeConfigs: {
                                    issuerUri: runtimeConfigs.issuerUri,
                                    clientId: runtimeConfigs.clientId
                                },
                                oidcInitializationError: error
                            });

                            break;
                        }

                        if (!oidc.isUserLoggedIn) {
                            dClientCtx.resolve({
                                doWeHaveOidcInstance: true,
                                isUserLoggedIn: false,
                                oidc
                            });
                            break;
                        }

                        dClientCtx.resolve({
                            doWeHaveOidcInstance: true,
                            isUserLoggedIn: true,
                            oidc
                        });
                    }
                    break;
            }
        });

        function triggerClientInitializationIfNotAlreadyDone(): void {
            d.resolve();
        }

        return { triggerClientInitializationIfNotAlreadyDone };
    })();

    const { getOidc } = (() => {
        let oidc_cached: Oidc<User> | undefined = undefined;

        async function getOidc(params?: {
            assert?: "user logged in" | "user not logged in";
        }): Promise<Oidc<User>> {
            if (!isBrowser) {
                throw new Error("oidc-spa: getOidc() can't be used on the server");
            }

            triggerClientInitializationIfNotAlreadyDone();

            const ctx = await dClientCtx.pr;

            if (params?.assert === "user logged in") {
                if (!ctx.doWeHaveOidcInstance || !ctx.isUserLoggedIn) {
                    throw new Error(
                        [
                            "oidc-spa: Called getOidc({ assert: 'user logged in' })",
                            "but the user is not currently logged in."
                        ].join(" ")
                    );
                }
            }

            if (params?.assert === "user not logged in") {
                if (ctx.doWeHaveOidcInstance && ctx.isUserLoggedIn) {
                    throw new Error(
                        [
                            "oidc-spa: Called getOidc({ assert: 'user not logged in' })",
                            "but the user is currently logged in."
                        ].join(" ")
                    );
                }
            }

            if (oidc_cached !== undefined) {
                return oidc_cached;
            }

            oidc_cached = await (async () => {
                if (!ctx.doWeHaveOidcInstance) {
                    return id<Oidc.NotLoggedIn>({
                        isUserLoggedIn: false,
                        issuerUri:
                            ctx.runtimeConfigs === undefined
                                ? "https://not-resolved-yet"
                                : toFullyQualifiedUrl({
                                      urlish: ctx.runtimeConfigs.issuerUri,
                                      doAssertNoQueryParams: true,
                                      doOutputWithTrailingSlash: false,
                                      rootUrl_fullyQualified: window.location.origin
                                  }),
                        clientId:
                            ctx.runtimeConfigs === undefined
                                ? "not-resolved-yet"
                                : ctx.runtimeConfigs.clientId,
                        get validRedirectUri() {
                            try {
                                return getHomeUrlAndValidRedirectUri().validRedirectUri;
                            } catch {
                                return "redirect-uri-is-unknown";
                            }
                        },
                        login: async () => {
                            throw ctx.oidcInitializationError;
                        },
                        initializationError: ctx.oidcInitializationError
                    });
                }

                return ctx.oidc;
            })();

            return oidc_cached;
        }

        return { getOidc };
    })();

    return {
        // @ts-expect-error: We know what we are doing
        getOidc
    };
}
