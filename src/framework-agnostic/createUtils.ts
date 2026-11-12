import type { OidcSpaUtils, RuntimeConfigs, CreateClientUser, Oidc } from "./types";
import { OidcInitializationError } from "../core/OidcInitializationError";
import { isBrowser } from "../tools/isBrowser";
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";

export function createUtils<User>(params: {
    createUser: CreateClientUser<User>;
    getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>;
}): OidcSpaUtils<User> {
    const { createUser, getRuntimeConfigsOrRuntimeConfigs } = params;

    function initializationFailed(initializationError: OidcInitializationError): Oidc.NotLoggedIn {
        const getAccessErrorMessage = (propertyName: string) =>
            `oidc-spa: Cannot read oidc.${propertyName} because OIDC initialization failed before a client was available. Check oidc.initializationError before accessing provider configuration.`;

        return {
            isUserLoggedIn: false,
            get clientId(): string {
                throw new Error(getAccessErrorMessage("clientId"));
            },
            get issuerUri(): string {
                throw new Error(getAccessErrorMessage("issuerUri"));
            },
            get validRedirectUri(): string {
                throw new Error(getAccessErrorMessage("validRedirectUri"));
            },
            login: async () => {
                alert("Authentication is currently unavailable. Please try again later.");
                return new Promise<never>(() => {});
            },
            initializationError
        };
    }

    async function initialize(): Promise<Oidc<User>> {
        let runtimeConfigs: RuntimeConfigs;

        try {
            runtimeConfigs =
                typeof getRuntimeConfigsOrRuntimeConfigs === "function"
                    ? await getRuntimeConfigsOrRuntimeConfigs()
                    : getRuntimeConfigsOrRuntimeConfigs;
        } catch (error) {
            return initializationFailed(
                new OidcInitializationError({
                    isAuthServerLikelyDown: false,
                    messageOrCause: new Error(
                        "Error thrown while evaluating the runtime configs getter on the client",
                        // @ts-expect-error
                        { cause: error }
                    )
                })
            );
        }

        switch (runtimeConfigs.mode) {
            case "mock": {
                const { createMockOidc } = await import("../core/createMockOidc");

                return createMockOidc<User>({
                    createUser_mock: params => createUser({ isMock: true, ...params }),
                    isUserInitiallyLoggedIn: runtimeConfigs.isUserInitiallyLoggedIn ?? true,
                    issuerUri_mock: runtimeConfigs.issuerUri_mock,
                    clientId_mock: runtimeConfigs.clientId_mock,
                    idTokenClaims_mock: runtimeConfigs.idTokenClaims_mock,
                    idToken_mock: runtimeConfigs.idToken_mock,
                    accessToken_mock: runtimeConfigs.accessToken_mock,
                    refreshToken_mock: runtimeConfigs.refreshToken_mock
                });
            }
            case "real": {
                const { createOidc } = await import("../core");

                try {
                    return await createOidc<User>({
                        issuerUri: runtimeConfigs.issuerUri,
                        clientId: runtimeConfigs.clientId,
                        idleSessionLifetimeInSeconds: runtimeConfigs.idleSessionLifetimeInSeconds,
                        scopes: runtimeConfigs.scopes,
                        transformAuthorizationUrl: runtimeConfigs.transformAuthorizationUrl,
                        authorizationParams: runtimeConfigs.authorizationParams,
                        tokenParams: runtimeConfigs.tokenParams,
                        sessionRestorationMethod: runtimeConfigs.sessionRestorationMethod,
                        debugLogs: runtimeConfigs.debugLogs,
                        __oidcProviderMetadata: runtimeConfigs.__oidcProviderMetadata,
                        autoLogout_returnToUrl: runtimeConfigs.autoLogout_returnToUrl,
                        disableDPoP: runtimeConfigs.disableDPoP,
                        warnUserSecondsBeforeAutoLogout: runtimeConfigs.warnUserSecondsBeforeAutoLogout,
                        createUser: params => createUser({ isMock: false, ...params })
                    });
                } catch (error) {
                    if (!(error instanceof OidcInitializationError)) {
                        throw error;
                    }

                    return initializationFailed(error);
                }
            }
        }
    }

    let prOidc: Promise<Oidc<User>> | undefined;

    function getOidc(params?: { assert?: undefined }): Promise<Oidc<User>>;
    function getOidc(params: { assert: "user logged in" }): Promise<Oidc.LoggedIn<User>>;
    function getOidc(params: { assert: "user not logged in" }): Promise<Oidc.NotLoggedIn>;
    async function getOidc(params?: {
        assert?: "user logged in" | "user not logged in";
    }): Promise<Oidc<User>> {
        if (!isBrowser) {
            throw new Error("oidc-spa: getOidc() can't be used on the server");
        }

        const oidc = await (prOidc ??= initialize());

        if (params?.assert === "user logged in" && !oidc.isUserLoggedIn) {
            throw new Error(
                "oidc-spa: Called getOidc({ assert: 'user logged in' }) but the user is not currently logged in."
            );
        }
        if (params?.assert === "user not logged in" && oidc.isUserLoggedIn) {
            throw new Error(
                "oidc-spa: Called getOidc({ assert: 'user not logged in' }) but the user is currently logged in."
            );
        }

        return oidc;
    }

    return { getOidc };
}
