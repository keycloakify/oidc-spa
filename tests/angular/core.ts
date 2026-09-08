// Substitute only the OIDC transport. User construction/refresh uses the real core implementation.
import type { Oidc, ParamsOfCreateOidc } from "../../src/core";
import { createGetUser } from "../../src/core/createGetUser";
import { createEvt } from "../../src/tools/Evt";
import { OidcInitializationError } from "../../src/core/OidcInitializationError";
import { Deferred } from "../../src/tools/Deferred";

export function createCoreController() {
    const ready = new Deferred<void>();
    const tokenListeners = new Set<(tokens: Oidc.Tokens) => void>();
    const countdownListeners = new Set<(params: { secondsLeft: number | undefined }) => void>();
    let tokens: Oidc.Tokens = {
        hasRefreshToken: false,
        accessToken: "access-token-1",
        accessTokenExpirationTime: Date.now() + 3600_000,
        idToken: "id-token",
        decodedIdToken: {
            iss: "https://issuer.test",
            sub: "alice",
            aud: "client",
            exp: 9999999999,
            iat: 1,
            name: "Alice"
        },
        decodedIdToken_original: {
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
        params: undefined as ParamsOfCreateOidc<any, boolean, any> | undefined,
        loginParams: undefined as Parameters<Oidc.NotLoggedIn["login"]>[0],
        logoutParams: undefined as Parameters<Oidc.LoggedIn["logout"]>[0] | undefined,
        tokenListeners,
        countdownListeners,
        rotate(name?: string) {
            tokens = {
                ...tokens,
                accessToken: `access-token-${++controller.renewals + 1}`,
                decodedIdToken_original: {
                    ...tokens.decodedIdToken_original,
                    iat: controller.renewals + 1,
                    ...(name === undefined ? {} : { name })
                }
            };
            tokenListeners.forEach(next => next(tokens));
            evtTokensChange.post();
        },
        async createOidc(params: ParamsOfCreateOidc<any, boolean, any>): Promise<Oidc<any, any>> {
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
                validRedirectUri: "https://app.test/"
            };
            if (!controller.loggedIn || initializationError !== undefined)
                return {
                    ...common,
                    isUserLoggedIn: false,
                    initializationError,
                    login: async params => {
                        controller.loginParams = params;
                        return new Promise<never>(() => {});
                    }
                };
            const { getUser } = createGetUser({
                ...common,
                createUser: params.createUser,
                getCurrentTokens: () => tokens,
                evtTokensChange,
                renewTokens: async () => controller.rotate(),
                oidcMetadata: {}
            });
            return {
                ...common,
                isUserLoggedIn: true,
                getTokens: async () => tokens,
                getDecodedIdToken: () => tokens.decodedIdToken,
                renewTokens: async () => controller.rotate(),
                logout: async params => {
                    controller.logoutParams = params;
                    return new Promise<never>(() => {});
                },
                goToAuthServer: async () => new Promise<never>(() => {}),
                isNewBrowserSession: true,
                backFromAuthServer: undefined,
                subscribeToTokensChange: next => {
                    tokenListeners.add(next);
                    return {
                        unsubscribeFromTokensChange: () => {
                            tokenListeners.delete(next);
                        }
                    };
                },
                subscribeToAutoLogoutCountdown: next => {
                    countdownListeners.add(next);
                    return {
                        unsubscribeFromAutoLogoutCountdown: () => {
                            countdownListeners.delete(next);
                        }
                    };
                },
                getUser: async () => {
                    const result = await getUser();
                    return {
                        ...result,
                        subscribeToUserChange: next => {
                            controller.userSubscriptions++;
                            const sub = result.subscribeToUserChange(next);
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
