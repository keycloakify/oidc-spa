import type { Oidc } from "../core";
import { createObjectThatThrowsIfAccessed } from "../tools/createObjectThatThrowsIfAccessed";
import { id } from "../vendor/frontend/tsafe";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { getSearchParam, addOrUpdateSearchParam } from "../tools/urlSearchParams";
import { getRootRelativeOriginalLocationHref } from "../core/earlyInit";
import { INFINITY_TIME } from "../tools/INFINITY_TIME";

export type ParamsOfCreateMockOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    AutoLogin extends boolean = false
> = {
    mockedParams?: Partial<Oidc["params"]>;
    mockedTokens?: Partial<Oidc.Tokens<DecodedIdToken>>;
    /**
     * The URL of the home page of your app.
     * We need to know this so we know where to redirect when you call `logout({ redirectTo: "home"})`.
     * In the majority of cases it should be `homeUrl: "/"` but it could aso be something like `homeUrl: "/dashboard"`
     * if your web app isn't hosted at the root of the domain.
     */
    homeUrl: string;
    autoLogin?: AutoLogin;
    postLoginRedirectUrl?: string;
} & (AutoLogin extends true
    ? { isUserInitiallyLoggedIn?: true }
    : {
          isUserInitiallyLoggedIn: boolean;
      });

const URL_SEARCH_PARAM_NAME = "isUserLoggedIn";

const locationHref_moduleEvalTime = location.href;

export async function createMockOidc<
    DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base,
    AutoLogin extends boolean = false
>(
    params: ParamsOfCreateMockOidc<DecodedIdToken, AutoLogin>
): Promise<AutoLogin extends true ? Oidc.LoggedIn<DecodedIdToken> : Oidc<DecodedIdToken>> {
    const {
        isUserInitiallyLoggedIn = true,
        mockedParams = {},
        mockedTokens = {},
        homeUrl: homeUrl_params,
        autoLogin = false,
        postLoginRedirectUrl
    } = params;

    const isUserLoggedIn = (() => {
        const { wasPresent, value } = getSearchParam({
            url: toFullyQualifiedUrl({
                urlish: (() => {
                    try {
                        return getRootRelativeOriginalLocationHref();
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
        urlish: homeUrl_params,
        doAssertNoQueryParams: true,
        doOutputWithTrailingSlash: true
    });

    const common: Oidc.Common = {
        params: {
            clientId: mockedParams.clientId ?? "mymockclient",
            issuerUri: mockedParams.issuerUri ?? "https://my-mock-oidc-server.net/realms/mymockrealm"
        }
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
            login: ({ redirectUrl }) => loginOrGoToAuthServer({ redirectUrl }),
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

    const oidc: Oidc.LoggedIn<DecodedIdToken> = {
        ...common,
        isUserLoggedIn: true,
        renewTokens: async () => {},
        ...(() => {
            const tokens_common: Oidc.Tokens.Common<DecodedIdToken> = {
                accessToken: mockedTokens.accessToken ?? "mocked-access-token",
                accessTokenExpirationTime: mockedTokens.accessTokenExpirationTime ?? INFINITY_TIME,
                idToken: mockedTokens.idToken ?? "mocked-id-token",
                decodedIdToken:
                    mockedTokens.decodedIdToken ??
                    createObjectThatThrowsIfAccessed<DecodedIdToken>({
                        debugMessage: [
                            "You haven't provided a mocked decodedIdToken",
                            "See https://docs.oidc-spa.dev/v/v8/mock"
                        ].join("\n")
                    }),
                decodedIdToken_original:
                    mockedTokens.decodedIdToken_original ??
                    createObjectThatThrowsIfAccessed<Oidc.Tokens.DecodedIdToken_base>({
                        debugMessage: [
                            "You haven't provided a mocked decodedIdToken_original",
                            "See https://docs.oidc-spa.dev/v/v8/mock"
                        ].join("\n")
                    }),
                issuedAtTime: Date.now(),
                getServerDateNow: () => Date.now()
            };

            const tokens: Oidc.Tokens<DecodedIdToken> =
                mockedTokens.refreshToken !== undefined || mockedTokens.hasRefreshToken === true
                    ? id<Oidc.Tokens.WithRefreshToken<DecodedIdToken>>({
                          ...tokens_common,
                          hasRefreshToken: true,
                          refreshToken: mockedTokens.refreshToken ?? "mocked-refresh-token",
                          refreshTokenExpirationTime: mockedTokens.refreshTokenExpirationTime
                      })
                    : id<Oidc.Tokens.WithoutRefreshToken<DecodedIdToken>>({
                          ...tokens_common,
                          hasRefreshToken: false
                      });

            return {
                getTokens: () => Promise.resolve(tokens),
                getDecodedIdToken: () => tokens_common.decodedIdToken
            };
        })(),
        subscribeToTokensChange: () => ({
            unsubscribe: () => {}
        }),
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
        backFromAuthServer: undefined
    };

    return oidc;
}
