import type { Oidc } from "../core";
import { createObjectThatThrowsIfAccessed } from "../tools/createObjectThatThrowsIfAccessed";
import { id } from "../tools/tsafe/id";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { getSearchParam, addOrUpdateSearchParam } from "../tools/urlSearchParams";
import { getRootRelativeOriginalLocationHref_earlyInit } from "../core/earlyInit_rootRelativeOriginalLocationHref";
import { INFINITY_TIME } from "../tools/INFINITY_TIME";
import { getBASE_URL_earlyInit } from "../core/earlyInit_BASE_URL";
import { decodeJwt } from "../tools/decodeJwt";

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
    /**
     * The URL of the home page of your app.
     * We need to know this so we know where to redirect when you call `logout({ redirectTo: "home"})`.
     * In the majority of cases it should be `homeUrl: "/"` but it could aso be something like `homeUrl: "/dashboard"`
     * if your web app isn't hosted at the root of the domain.
     */
    BASE_URL?: string;

    autoLogin?: AutoLogin;
    postLoginRedirectUrl?: string;
} & (AutoLogin extends true
    ? { isUserInitiallyLoggedIn?: true }
    : {
          isUserInitiallyLoggedIn: boolean;
      });

const URL_SEARCH_PARAM_NAME = "isUserLoggedIn";

const locationHref_moduleEvalTime = location.href;

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

    const BASE_URL_params = params.BASE_URL;

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

    const homeUrl = toFullyQualifiedUrl({
        urlish: BASE_URL_params ?? getBASE_URL_earlyInit() ?? "/",
        doAssertNoQueryParams: true,
        doOutputWithTrailingSlash: true
    });

    const common: Oidc.Common = {
        clientId: clientId_mock ?? "mymockclient",
        issuerUri: issuerUri_mock ?? "https://my-mock-oidc-server.net/realms/mymockrealm",
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
                accessToken: accessToken_mock ?? "mocked-access-token",
                accessTokenExpirationTime: accessTokenExpirationTime_mock ?? INFINITY_TIME,
                idToken: idToken_mock ?? "mocked-id-token",
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
