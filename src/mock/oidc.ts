import type { Oidc } from "../oidc";
import { retrieveQueryParamFromUrl, addQueryParamToUrl } from "../tools/urlQueryParams";
import { id } from "tsafe/id";
import { createObjectThatThrowsIfAccessed } from "../tools/createObjectThatThrowsIfAccessed";
import { assert, type Equals } from "tsafe/assert";

export type ParamsOfCreateMockOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>
> = {
    isUserInitiallyLoggedIn: boolean;
    mockedParams?: Partial<Oidc["params"]>;
    mockedTokens?: Partial<Oidc.Tokens<DecodedIdToken>>;
    publicUrl?: string;
};

const urlParamName = "isUserLoggedIn";

export function createMockOidc<DecodedIdToken extends Record<string, unknown> = Record<string, unknown>>(
    params: ParamsOfCreateMockOidc<DecodedIdToken>
): Oidc<DecodedIdToken> {
    const {
        isUserInitiallyLoggedIn,
        mockedParams = {},
        mockedTokens = {},
        publicUrl = window.location.origin
    } = params;

    const isUserLoggedIn = (() => {
        const result = retrieveQueryParamFromUrl({
            "url": window.location.href,
            "name": urlParamName
        });

        if (!result.wasPresent) {
            return isUserInitiallyLoggedIn;
        }

        window.history.replaceState({}, "", result.newUrl);

        return result.value === "true";
    })();

    const common: Oidc.Common = {
        "params": {
            "clientId": mockedParams.clientId ?? "mymockclient",
            "issuerUri": mockedParams.issuerUri ?? "https://my-mock-oidc-server.net/realms/mymockrealm"
        }
    };

    if (!isUserLoggedIn) {
        return id<Oidc.NotLoggedIn>({
            ...common,
            "isUserLoggedIn": false,
            "login": async () => {
                const { newUrl } = addQueryParamToUrl({
                    "url": window.location.href,
                    "name": urlParamName,
                    "value": "true"
                });

                window.location.href = newUrl;

                return new Promise<never>(() => {});
            },
            "initializationError": undefined
        });
    }

    return id<Oidc.LoggedIn<DecodedIdToken>>({
        ...common,
        "isUserLoggedIn": true,
        "renewTokens": async () => {},
        "getTokens": (() => {
            const tokens: Oidc.Tokens<DecodedIdToken> = {
                "accessToken": mockedTokens.accessToken ?? "mocked-access-token",
                "accessTokenExpirationTime": mockedTokens.accessTokenExpirationTime ?? Infinity,
                "idToken": mockedTokens.idToken ?? "mocked-id-token",
                "refreshToken": mockedTokens.refreshToken ?? "mocked-refresh-token",
                "refreshTokenExpirationTime": mockedTokens.refreshTokenExpirationTime ?? Infinity,
                "decodedIdToken":
                    mockedTokens.decodedIdToken ??
                    createObjectThatThrowsIfAccessed<DecodedIdToken>({
                        "debugMessage": [
                            "You haven't provided a mocked decodedIdToken",
                            "See https://docs.oidc-spa.dev/documentation/mock"
                        ].join("\n")
                    })
            };

            return () => tokens;
        })(),
        "subscribeToTokensChange": () => ({
            "unsubscribe": () => {}
        }),
        "logout": params => {
            const { newUrl } = addQueryParamToUrl({
                "url": (() => {
                    switch (params.redirectTo) {
                        case "current page":
                            return window.location.href;
                        case "home":
                            return publicUrl;
                        case "specific url":
                            return params.url;
                    }
                    assert<Equals<typeof params, never>>(false);
                })(),
                "name": urlParamName,
                "value": "false"
            });

            window.location.href = newUrl;

            return new Promise<never>(() => {});
        },
        "subscribeToAutoLogoutCountdown": () => ({
            "unsubscribeFromAutoLogoutCountdown": () => {}
        }),
        "loginScenario": isUserInitiallyLoggedIn ? "silentSignin" : "backFromLoginPages"
    });
}
