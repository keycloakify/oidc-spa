import type { Oidc } from "../oidc";
import { retrieveQueryParamFromUrl, addQueryParamToUrl } from "../tools/urlQueryParams";
import { createObjectThatThrowsIfAccessed } from "../tools/createObjectThatThrowsIfAccessed";
import { id } from "../vendor/frontend/tsafe";
import { assert, type Equals } from "../vendor/frontend/tsafe";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";

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

const urlParamName = "isUserLoggedIn";

export async function createMockOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
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
        const result = retrieveQueryParamFromUrl({
            url: window.location.href,
            name: urlParamName
        });

        if (!result.wasPresent) {
            return isUserInitiallyLoggedIn;
        }

        window.history.replaceState({}, "", result.newUrl);

        return result.value === "true";
    })();

    const homeUrl = toFullyQualifiedUrl({
        urlish: homeUrl_params,
        doAssertNoQueryParams: true
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
        const { redirectUrl } = params;

        const { newUrl } = addQueryParamToUrl({
            url: (() => {
                if (redirectUrl === undefined) {
                    return window.location.href;
                }
                return redirectUrl.startsWith("/")
                    ? `${window.location.origin}${redirectUrl}`
                    : redirectUrl;
            })(),
            name: urlParamName,
            value: "true"
        });

        window.location.href = newUrl;

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

    return id<Oidc.LoggedIn<DecodedIdToken>>({
        ...common,
        isUserLoggedIn: true,
        renewTokens: async () => {},
        getTokens: (() => {
            const tokens: Oidc.Tokens<DecodedIdToken> = {
                accessToken: mockedTokens.accessToken ?? "mocked-access-token",
                accessTokenExpirationTime: mockedTokens.accessTokenExpirationTime ?? Infinity,
                idToken: mockedTokens.idToken ?? "mocked-id-token",
                refreshToken: mockedTokens.refreshToken ?? "mocked-refresh-token",
                refreshTokenExpirationTime: mockedTokens.refreshTokenExpirationTime ?? Infinity,
                decodedIdToken:
                    mockedTokens.decodedIdToken ??
                    createObjectThatThrowsIfAccessed<DecodedIdToken>({
                        debugMessage: [
                            "You haven't provided a mocked decodedIdToken",
                            "See https://docs.oidc-spa.dev/v/v6/mock"
                        ].join("\n")
                    })
            };

            return () => tokens;
        })(),
        subscribeToTokensChange: () => ({
            unsubscribe: () => {}
        }),
        logout: params => {
            const { newUrl } = addQueryParamToUrl({
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
                    assert<Equals<typeof params, never>>(false);
                })(),
                name: urlParamName,
                value: "false"
            });

            window.location.href = newUrl;

            return new Promise<never>(() => {});
        },
        subscribeToAutoLogoutCountdown: () => ({
            unsubscribeFromAutoLogoutCountdown: () => {}
        }),
        //"loginScenario": isUserInitiallyLoggedIn ? "silentSignin" : "backFromLoginPages",
        goToAuthServer: async ({ redirectUrl }) => loginOrGoToAuthServer({ redirectUrl }),
        isNewBrowserSession: false,
        backFromAuthServer: undefined
    });
}
