import type { Oidc } from "../core";
import { createObjectThatThrowsIfAccessed } from "../tools/createObjectThatThrowsIfAccessed";
import { id } from "../tools/tsafe/id";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { getSearchParam, addOrUpdateSearchParam } from "../tools/urlSearchParams";
import { getRootRelativeOriginalLocationHref_earlyInit } from "../core/earlyInit_rootRelativeOriginalLocationHref";
import { INFINITY_TIME } from "../tools/INFINITY_TIME";
import { getBASE_URL_earlyInit, prBASE_URL_earlyInit_set } from "./earlyInit_BASE_URL";
import { decodeJwt } from "../tools/decodeJwt";
import { assert } from "../tools/tsafe/assert";

export type ParamsOfCreateMockOidc<User, AutoLogin extends boolean> = {
    user_mock?: User;
    issuerUri_mock?: string;
    clientId_mock?: string;
    decodedIdToken_mock?: Oidc.Tokens.DecodedIdToken;
    idToken_mock?: string;
    accessToken_mock?: string;
    accessTokenExpirationTime_mock?: number;
    refreshToken_mock?: string;
    refreshTokenExpirationTime_mock?: number;
    autoLogin?: AutoLogin;
    postLoginRedirectUrl?: string;
} & (AutoLogin extends true
    ? { isUserInitiallyLoggedIn?: true }
    : {
          isUserInitiallyLoggedIn: boolean;
      });

const URL_SEARCH_PARAM_NAME = "isUserLoggedIn";

const locationHref_moduleEvalTime = location.href;

export const ClIENT_ID_MOCK_DEFAULT = "myclientmock";
export const ISSUER_URI_MOCK_DEFAULT = "https://auth.mycompany.com/realms/mymockrealm";
export const ACCESS_TOKEN_MOCK_DEFAULT = "mocked-access-token";
export const ID_TOKEN_MOCK_DEFAULT = "mocked-id-token";

export async function createMockOidc<User = never, AutoLogin extends boolean = false>(
    params: ParamsOfCreateMockOidc<User, AutoLogin>
): Promise<AutoLogin extends true ? Oidc.LoggedIn<User> : Oidc<User>> {
    const {
        user_mock,
        isUserInitiallyLoggedIn = true,
        issuerUri_mock,
        clientId_mock,
        decodedIdToken_mock,
        idToken_mock,
        accessToken_mock,
        accessTokenExpirationTime_mock,
        refreshToken_mock,
        refreshTokenExpirationTime_mock,
        autoLogin = false,
        postLoginRedirectUrl
    } = params;

    const isUserLoggedIn = (() => {
        const { wasPresent, value } = getSearchParam({
            url: toFullyQualifiedUrl({
                urlish: (() => {
                    try {
                        return getRootRelativeOriginalLocationHref_earlyInit();
                    } catch {
                        return locationHref_moduleEvalTime;
                    }
                })(),
                doAssertNoQueryParams: false
            }),
            name: URL_SEARCH_PARAM_NAME
        });

        if (!wasPresent) {
            return isUserInitiallyLoggedIn;
        }

        remove_from_url: {
            const { wasPresent, url_withoutTheParam } = getSearchParam({
                url: window.location.href,
                name: URL_SEARCH_PARAM_NAME
            });

            if (!wasPresent) {
                break remove_from_url;
            }

            window.history.replaceState({}, "", url_withoutTheParam);
        }

        return value === "true";
    })();

    {
        const timer = window.setTimeout(() => {
            console.warn(
                [
                    "oidc-spa: Setup error.",
                    "oidcEarlyInit() wasn't called.",
                    "This is supposed to be handled by the oidc-spa Vite plugin",
                    "or manually in other environments."
                ].join(" ")
            );
        }, 3_000);

        await prBASE_URL_earlyInit_set;

        window.clearTimeout(timer);
    }

    const homeUrl = toFullyQualifiedUrl({
        urlish: (() => {
            const BASE_URL = getBASE_URL_earlyInit();
            assert(BASE_URL !== undefined);
            return BASE_URL;
        })(),
        doAssertNoQueryParams: true,
        doOutputWithTrailingSlash: true
    });

    const common: Oidc.Common = {
        clientId: clientId_mock ?? ClIENT_ID_MOCK_DEFAULT,
        issuerUri: issuerUri_mock ?? ISSUER_URI_MOCK_DEFAULT,
        validRedirectUri: homeUrl
    };

    const loginOrGoToAuthServer = async (params: {
        redirectUrl: string | undefined;
    }): Promise<never> => {
        const { redirectUrl: redirectUrl_params } = params;

        const redirectUrl = addOrUpdateSearchParam({
            url: (() => {
                if (redirectUrl_params === undefined) {
                    return window.location.href;
                }

                return toFullyQualifiedUrl({
                    urlish: redirectUrl_params,
                    doAssertNoQueryParams: false
                });
            })(),
            name: URL_SEARCH_PARAM_NAME,
            value: "true",
            encodeMethod: "www-form"
        });

        window.location.href = redirectUrl;

        return new Promise<never>(() => {});
    };

    if (!isUserLoggedIn) {
        const oidc = id<Oidc.NotLoggedIn>({
            ...common,
            isUserLoggedIn: false,
            login: ({ redirectUrl } = {}) => loginOrGoToAuthServer({ redirectUrl }),
            initializationError: undefined
        });
        if (autoLogin) {
            await oidc.login({
                redirectUrl: postLoginRedirectUrl,
                doesCurrentHrefRequiresAuth: true
            });
            // Never here
        }
        // @ts-expect-error: We know what we are doing
        return oidc;
    }

    const oidc: Oidc.LoggedIn<User> = {
        ...common,
        isUserLoggedIn: true,
        renewTokens: async () => {},
        ...(() => {
            const tokens_common: Oidc.Tokens.Common = {
                accessToken: accessToken_mock ?? ACCESS_TOKEN_MOCK_DEFAULT,
                accessTokenExpirationTime: accessTokenExpirationTime_mock ?? INFINITY_TIME,
                idToken: idToken_mock ?? ID_TOKEN_MOCK_DEFAULT,
                decodedIdToken: (() => {
                    if (decodedIdToken_mock !== undefined) {
                        return decodedIdToken_mock;
                    }

                    if (idToken_mock !== undefined) {
                        try {
                            return decodeJwt(idToken_mock);
                        } catch {}
                    }

                    return createObjectThatThrowsIfAccessed<Oidc.Tokens.DecodedIdToken>({
                        debugMessage: [
                            "You haven't provided a mocked decodedIdToken",
                            "See https://docs.oidc-spa.dev/v/v10/integration-guides/usage#mock-adapter"
                        ].join("\n")
                    });
                })(),
                issuedAtTime: Date.now(),
                getServerDateNow: () => Date.now()
            };

            const tokens: Oidc.Tokens =
                refreshToken_mock !== undefined
                    ? id<Oidc.Tokens.WithRefreshToken>({
                          ...tokens_common,
                          hasRefreshToken: true,
                          refreshToken: refreshToken_mock,
                          refreshTokenExpirationTime: refreshTokenExpirationTime_mock ?? INFINITY_TIME
                      })
                    : id<Oidc.Tokens.WithoutRefreshToken>({
                          ...tokens_common,
                          hasRefreshToken: false
                      });

            return {
                getTokens: () => Promise.resolve(tokens),
                getAccessToken: () => Promise.resolve(tokens.accessToken),
                getDecodedIdToken: () => tokens_common.decodedIdToken
            };
        })(),
        subscribeToTokensChange: () => {
            const unsubscribeFromTokensChange = () => {};
            return {
                unsubscribeFromTokensChange,
                unsubscribe: unsubscribeFromTokensChange
            };
        },
        logout: params => {
            const redirectUrl = addOrUpdateSearchParam({
                url: (() => {
                    switch (params.redirectTo) {
                        case "current page":
                            return window.location.href;
                        case "home":
                            return homeUrl;
                        case "specific url":
                            return toFullyQualifiedUrl({
                                urlish: params.url,
                                doAssertNoQueryParams: false
                            });
                    }
                })(),
                name: URL_SEARCH_PARAM_NAME,
                value: "false",
                encodeMethod: "www-form"
            });

            window.location.href = redirectUrl;

            return new Promise<never>(() => {});
        },
        subscribeToAutoLogoutCountdown: () => ({
            unsubscribeFromAutoLogoutCountdown: () => {}
        }),
        goToAuthServer: async ({ redirectUrl }) => loginOrGoToAuthServer({ redirectUrl }),
        isNewBrowserSession: false,
        backFromAuthServer: undefined,
        getUser: () => {
            if (user_mock === undefined) {
                throw new Error("oidc-spa: No mock user provided");
            }

            return Promise.resolve({
                refreshUser: () => Promise.resolve(user_mock),
                subscribeToUserChange: () => {
                    return { unsubscribeFromUserChange: () => {} };
                },
                user: user_mock
            });
        }
    };

    return oidc;
}
