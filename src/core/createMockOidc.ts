import type { Oidc } from "../core";
import { id } from "../tools/tsafe/id";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { getSearchParam, addOrUpdateSearchParam } from "../tools/urlSearchParams";
import { getRootRelativeOriginalLocationHref_earlyInit } from "../core/earlyInit_rootRelativeOriginalLocationHref";
import { INFINITY_TIME } from "../tools/INFINITY_TIME";
import { getBASE_URL_earlyInit, prBASE_URL_earlyInit_set } from "./earlyInit_BASE_URL";
import { decodeJwt } from "../tools/decodeJwt";
import type { OidcTokens, ParamsOfCreateMockOidc } from "./types";
import { createGetUser } from "./createGetUser";
import { createEvt } from "../tools/Evt";

const URL_SEARCH_PARAM_NAME = "isUserLoggedIn";

export const ACCESS_TOKEN_MOCK_DEFAULT = "mocked-access-token";

export async function createMockOidc<User = never, AutoLogin extends boolean = false>(
    params: ParamsOfCreateMockOidc<User, AutoLogin>
): Promise<AutoLogin extends true ? Oidc.LoggedIn<User> : Oidc<User>> {
    const {
        createUser_mock,
        isUserInitiallyLoggedIn = true,
        issuerUri_mock,
        clientId_mock,
        idTokenClaims_mock,
        idToken_mock,
        accessToken_mock,
        refreshToken_mock,
        autoLogin = false,
        autoLogin_returnToUrl
    } = params;

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

    const isUserLoggedIn = (() => {
        const { wasPresent, values } = getSearchParam({
            url: toFullyQualifiedUrl({
                urlish: getRootRelativeOriginalLocationHref_earlyInit(),
                doAssertNoQueryParams: false,
                rootUrl_fullyQualified: window.location.origin
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

        return values[0] === "true";
    })();

    const homeUrl = toFullyQualifiedUrl({
        urlish: getBASE_URL_earlyInit(),
        doAssertNoQueryParams: true,
        doOutputWithTrailingSlash: true,
        rootUrl_fullyQualified: window.location.origin
    });

    const common: Oidc.Common = {
        clientId: clientId_mock ?? "myclientmock",
        issuerUri: issuerUri_mock ?? "https://auth.mycompany.com/realms/mymockrealm",
        validRedirectUri: homeUrl
    };

    const loginOrStartAuthorization = async (params: {
        returnToUrl: string | undefined;
    }): Promise<never> => {
        const { returnToUrl: returnToUrl_params } = params;

        const returnToUrl = addOrUpdateSearchParam({
            url: (() => {
                if (returnToUrl_params === undefined) {
                    return window.location.href;
                }

                return toFullyQualifiedUrl({
                    urlish: returnToUrl_params,
                    doAssertNoQueryParams: false,
                    rootUrl_fullyQualified: homeUrl
                });
            })(),
            name: URL_SEARCH_PARAM_NAME,
            values: ["true"],
            encodeMethod: "www-form",
            ifAlreadyPresent: "replace all by new values"
        });

        window.location.href = returnToUrl;

        return new Promise<never>(() => {});
    };

    if (!isUserLoggedIn) {
        const oidc = id<Oidc.NotLoggedIn>({
            ...common,
            isUserLoggedIn: false,
            login: ({ returnToUrl } = {}) => loginOrStartAuthorization({ returnToUrl }),
            initializationError: undefined
        });
        if (autoLogin) {
            await oidc.login({
                returnToUrl: autoLogin_returnToUrl,
                doesCurrentHrefEnforceLogin: true
            });
            // Never here
        }
        // @ts-expect-error: We know what we are doing
        return oidc;
    }

    const now = Date.now();

    const tokens_common: OidcTokens.Common = {
        accessToken: accessToken_mock ?? ACCESS_TOKEN_MOCK_DEFAULT,
        accessTokenExpirationTime: INFINITY_TIME,
        idToken: idToken_mock ?? "mocked-id-token",
        idTokenClaims: (() => {
            if (idTokenClaims_mock !== undefined) {
                return idTokenClaims_mock;
            }

            if (idToken_mock !== undefined) {
                try {
                    return decodeJwt(idToken_mock);
                } catch {}
            }

            return {
                aud: common.clientId,
                exp: Math.floor(INFINITY_TIME / 1_000),
                iat: Math.floor(now / 1_000),
                iss: common.issuerUri,
                sub: "mocked-sub"
            };
        })(),
        issuedAtTime: now,
        getServerDateNow: () => Date.now()
    };

    const tokens: OidcTokens =
        refreshToken_mock !== undefined
            ? id<OidcTokens.WithRefreshToken>({
                  ...tokens_common,
                  hasRefreshToken: true,
                  refreshToken: refreshToken_mock,
                  refreshTokenExpirationTime: INFINITY_TIME
              })
            : id<OidcTokens.WithoutRefreshToken>({
                  ...tokens_common,
                  hasRefreshToken: false
              });

    const evtTokensChange = createEvt<void>();
    const onTokenChanges = new Set<(tokens: OidcTokens) => void>();

    const renewTokens: Oidc.LoggedIn["renewTokens"] = async () => {
        await Promise.resolve();
        evtTokensChange.post();
        Array.from(onTokenChanges).forEach(onTokenChange => onTokenChange(tokens));
    };

    const { getUser, refreshUser, subscribeToUserChange } = createGetUser({
        createUser: createUser_mock,
        evtTokensChange,
        getTokens: () => Promise.resolve(tokens),
        issuerUri: common.issuerUri,
        clientId: common.clientId,
        validRedirectUri: common.validRedirectUri,
        oidcProviderMetadata: {},
        renewTokens
    });

    const oidc: Oidc.LoggedIn<User> = {
        ...common,
        isUserLoggedIn: true,
        renewTokens,
        getTokens: () => Promise.resolve(tokens),
        getAccessToken: () => Promise.resolve(tokens.accessToken),
        subscribeToTokensChange: onTokenChange => {
            onTokenChanges.add(onTokenChange);

            const unsubscribeFromTokensChange = () => {
                onTokenChanges.delete(onTokenChange);
            };

            return {
                unsubscribeFromTokensChange,
                unsubscribe: unsubscribeFromTokensChange
            };
        },
        logout: ({ returnToUrl = window.location.href } = {}) => {
            const returnToUrl_withLoginState = addOrUpdateSearchParam({
                url: toFullyQualifiedUrl({
                    urlish: returnToUrl,
                    doAssertNoQueryParams: false,
                    rootUrl_fullyQualified: homeUrl
                }),
                name: URL_SEARCH_PARAM_NAME,
                values: ["false"],
                encodeMethod: "www-form",
                ifAlreadyPresent: "replace all by new values"
            });

            window.location.href = returnToUrl_withLoginState;

            return new Promise<never>(() => {});
        },
        subscribeToAutoLogoutState: () => ({
            unsubscribeFromAutoLogoutState: () => {}
        }),
        startAuthorization: ({ returnToUrl } = {}) => loginOrStartAuthorization({ returnToUrl }),
        isNewBrowserSession: false,
        authorizationResult: undefined,
        getUser,
        subscribeToUserChange,
        refreshUser
    };

    return oidc;
}
