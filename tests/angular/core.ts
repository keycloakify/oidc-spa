// Substitute only the OIDC transport. User construction/refresh uses the real core implementation.
import type { Oidc, OidcTokens, ParamsOfCreateOidc } from "../../src/core";
import { createGetUser } from "../../src/core/createGetUser";
import { createEvt } from "../../src/tools/Evt";
import { OidcInitializationError } from "../../src/core/OidcInitializationError";
import { Deferred } from "../../src/tools/Deferred";

type AutoLogoutState = Parameters<Parameters<Oidc.LoggedIn["subscribeToAutoLogoutState"]>[0]>[0];

export function createCoreController() {
    const ready = new Deferred<void>();
    const tokenListeners = new Set<(tokens: OidcTokens) => void>();
    const autoLogoutListeners = new Set<(state: AutoLogoutState) => void>();
    let tokens: OidcTokens = {
        hasRefreshToken: false,
        accessToken: "access-token-1",
        accessTokenExpirationTime: Date.now() + 3600_000,
        idToken: "id-token",
        idTokenClaims: {
            iss: "https://issuer.test",
            sub: "alice",
            aud: "client",
            exp: 9999999999,
            iat: 1,
            name: "Alice"
        },
        issuedAtTime: Date.now(),
        getServerDateNow: () => Date.now()
    };
    const evtTokensChange = createEvt<void>();
    const controller = {
        ready,
        loggedIn: true,
        error: undefined as Error | undefined,
        calls: 0,
        renewals: 0,
        userSubscriptions: 0,
        params: undefined as ParamsOfCreateOidc<any, boolean> | undefined,
        tokenRequests: [] as (Oidc.ParamsOfGetToken | undefined)[],
        loginParams: undefined as Parameters<Oidc.NotLoggedIn["login"]>[0] | undefined,
        logoutParams: undefined as Parameters<Oidc.LoggedIn["logout"]>[0],
        authorizationParams: undefined as Parameters<Oidc.LoggedIn["startAuthorization"]>[0],
        tokenListeners,
        autoLogoutListeners,
        emitAutoLogout(state: AutoLogoutState) {
            autoLogoutListeners.forEach(next => next(state));
        },
        rotate(name?: string) {
            tokens = {
                ...tokens,
                accessToken: `access-token-${++controller.renewals + 1}`,
                idTokenClaims: {
                    ...tokens.idTokenClaims,
                    iat: controller.renewals + 1,
                    ...(name === undefined ? {} : { name })
                }
            };
            tokenListeners.forEach(next => next(tokens));
            evtTokensChange.post();
        },
        async createOidc(params: ParamsOfCreateOidc<any, boolean>): Promise<Oidc<any>> {
            controller.calls++;
            controller.params = params;
            await ready.pr;
            const initializationError =
                controller.error instanceof OidcInitializationError && !params.autoLogin
                    ? controller.error
                    : undefined;
            if (controller.error && !initializationError) throw controller.error;
            const common = {
                issuerUri: params.issuerUri,
                clientId: params.clientId,
                validRedirectUri: "https://app.test/base/"
            };
            if (!controller.loggedIn || initializationError !== undefined) {
                return {
                    ...common,
                    isUserLoggedIn: false,
                    initializationError,
                    login: async params => {
                        controller.loginParams = params;
                        return new Promise<never>(() => {});
                    }
                };
            }
            const renewTokens = async () => controller.rotate();
            const userMethods = createGetUser({
                ...common,
                createUser: params.createUser,
                getTokens: async () => tokens,
                evtTokensChange,
                renewTokens,
                oidcProviderMetadata: {}
            });
            return {
                ...common,
                ...userMethods,
                isUserLoggedIn: true,
                getTokens: async params => {
                    controller.tokenRequests.push(params);
                    return tokens;
                },
                getAccessToken: async () => tokens.accessToken,
                renewTokens,
                logout: async params => {
                    controller.logoutParams = params;
                    return new Promise<never>(() => {});
                },
                startAuthorization: async params => {
                    controller.authorizationParams = params;
                    return new Promise<never>(() => {});
                },
                isNewBrowserSession: true,
                authorizationResult: {
                    authorizationParams: { kc_action: "UPDATE_PASSWORD" },
                    response: { kc_action_status: "success" }
                },
                subscribeToTokensChange: next => {
                    tokenListeners.add(next);
                    return {
                        unsubscribeFromTokensChange: () => {
                            tokenListeners.delete(next);
                        }
                    };
                },
                subscribeToAutoLogoutState: next => {
                    autoLogoutListeners.add(next);
                    return {
                        unsubscribeFromAutoLogoutState: () => {
                            autoLogoutListeners.delete(next);
                        }
                    };
                },
                subscribeToUserChange: next => {
                    controller.userSubscriptions++;
                    const sub = userMethods.subscribeToUserChange(next);
                    return {
                        unsubscribeFromUserChange: () => {
                            controller.userSubscriptions--;
                            sub.unsubscribeFromUserChange();
                        }
                    };
                }
            };
        }
    };
    return controller;
}

export let controller = createCoreController();
export function resetCore() {
    controller = createCoreController();
    return controller;
}
export const createOidc: typeof controller.createOidc = params => controller.createOidc(params);
