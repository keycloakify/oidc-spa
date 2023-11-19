import { UserManager, type User } from "oidc-client-ts";
import { id } from "tsafe/id";
import { readExpirationTimeInJwt } from "./tools/readExpirationTimeInJwt";
import { assert, type Equals } from "tsafe/assert";
import { addQueryParamToUrl, retrieveQueryParamFromUrl } from "./tools/urlQueryParams";
import { fnv1aHashToHex } from "./tools/fnv1aHashToHex";
import { Deferred } from "./tools/Deferred";

export declare type Oidc = Oidc.LoggedIn | Oidc.NotLoggedIn;

export declare namespace Oidc {
    export type Common = {
        params: {
            issuerUri: string;
            clientId: string;
        };
    };

    export type NotLoggedIn = Common & {
        isUserLoggedIn: false;
        login: (params: {
            doesCurrentHrefRequiresAuth: boolean;
            extraQueryParams?: Record<string, string>;
        }) => Promise<never>;
    };

    export type LoggedIn = Common & {
        isUserLoggedIn: true;
        renewTokens(): Promise<void>;
        getTokens: () => Tokens;
        logout: (
            params: { redirectTo: "home" | "current page" } | { redirectTo: "specific url"; url: string }
        ) => Promise<never>;
    };

    export type Tokens = {
        accessToken: string;
        accessTokenExpirationTime: number;
        idToken: string;
        refreshToken: string;
        refreshTokenExpirationTime: number;
    };
}

const paramsToRetrieveFromSuccessfulLogin = ["code", "state", "session_state"] as const;

/** @see: https://github.com/garronej/oidc-spa#option-1-usage-without-involving-the-ui-framework */
export async function createOidc(params: {
    issuerUri: string;
    clientId: string;
    transformUrlBeforeRedirect?: (url: string) => string;
    getExtraQueryParams?: () => Record<string, string>;
    /**
     * This parameter have to be provided if your App is not hosted at the origin of the subdomain.
     * For example if your site is hosted by navigating to `https://www.example.com`
     * you don't have to provide this parameter.
     * On the other end if your site is hosted by navigating to `https://www.example.com/my-app`
     * Then you want to set publicUrl to `/my-app`.
     * If you are using Vite: `publicUrl: import.meta.env.BASE_URL`
     * If you using Create React App: `publicUrl: process.env.PUBLIC_URL`
     *
     * Be mindful that `${window.location.origin}${publicUrl}/silent-sso.html` must return the `silent-sso.html` that
     * you are supposed to have created in your `public/` directory.
     */
    publicUrl?: string;
}): Promise<Oidc> {
    const {
        issuerUri,
        clientId,
        transformUrlBeforeRedirect = url => url,
        getExtraQueryParams,
        publicUrl: publicUrl_params
    } = params;

    const publicUrl = (() => {
        if (publicUrl_params === undefined) {
            return window.location.origin;
        }

        return (
            publicUrl_params.startsWith("http")
                ? publicUrl_params
                : `${window.location.origin}${publicUrl_params}`
        ).replace(/\/$/, "");
    })();

    const configHash = fnv1aHashToHex(`${issuerUri} ${clientId}`);
    const configHashKey = "configHash";

    const userManager = new UserManager({
        "authority": issuerUri,
        "client_id": clientId,
        "redirect_uri": "" /* provided when calling login */,
        "response_type": "code",
        "scope": "openid profile",
        "automaticSilentRenew": false,
        "silent_redirect_uri": `${publicUrl}/silent-sso.html?${configHashKey}=${configHash}`
    });

    const login: Oidc.NotLoggedIn["login"] = async ({
        doesCurrentHrefRequiresAuth,
        extraQueryParams
    }) => {
        //NOTE: We know there is a extraQueryParameter option but it doesn't allow
        // to control the encoding so we have to highjack global URL Class that is
        // used internally by oidc-client-ts. It's save to do so since this is the
        // last thing that will be done before the redirect.

        const URL_real = window.URL;

        function URL(...args: ConstructorParameters<typeof URL_real>) {
            const urlInstance = new URL_real(...args);

            return new Proxy(urlInstance, {
                "get": (target, prop) => {
                    if (prop === "href") {
                        let url = urlInstance.href;

                        Object.entries({
                            ...getExtraQueryParams?.(),
                            ...extraQueryParams
                        }).forEach(
                            ([name, value]) =>
                                (url = addQueryParamToUrl({
                                    url,
                                    name,
                                    value
                                }).newUrl)
                        );

                        url = transformUrlBeforeRedirect(url);

                        return url;
                    }

                    //@ts-expect-error
                    return target[prop];
                }
            });
        }

        Object.defineProperty(window, "URL", { "value": URL });

        const { newUrl: redirect_uri } = addQueryParamToUrl({
            "url": window.location.href,
            "name": configHashKey,
            "value": configHash
        });

        if (doesCurrentHrefRequiresAuth) {
            console.log("Here!");

            {
                const callback = () => {
                    console.log("callback visibilitychange!");

                    if (document.visibilityState === "visible") {
                        document.removeEventListener("visibilitychange", callback);
                        // User has returned to the app
                        console.log("We should navigate back visibilitychange");
                        //window.history.back();
                    }
                };
                document.addEventListener("visibilitychange", callback);
            }

            {
                const callback = () => {
                    console.log("callback focus!");

                    console.log({ "document.visibilityState": document.visibilityState });
                };

                window.addEventListener("focus", callback);
            }
        }

        await userManager.signinRedirect({
            redirect_uri,
            "redirectMethod": doesCurrentHrefRequiresAuth ? "replace" : "assign"
        });
        return new Promise<never>(() => {});
    };

    const currentTokens = await (async function getUser() {
        read_successful_login_query_params: {
            let url = window.location.href;

            {
                const result = retrieveQueryParamFromUrl({ "name": configHashKey, url });

                if (!result.wasPresent || result.value !== configHash) {
                    break read_successful_login_query_params;
                }

                url = result.newUrl;
            }

            {
                const result = retrieveQueryParamFromUrl({ "name": "error", url });

                if (result.wasPresent) {
                    throw new Error(`OIDC error: ${result.value}`);
                }
            }

            let loginSuccessUrl = "https://dummy.com";

            for (const name of paramsToRetrieveFromSuccessfulLogin) {
                const result = retrieveQueryParamFromUrl({ name, url });

                assert(result.wasPresent);

                loginSuccessUrl = addQueryParamToUrl({
                    "url": loginSuccessUrl,
                    "name": name,
                    "value": result.value
                }).newUrl;

                url = result.newUrl;
            }

            window.history.pushState(null, "", url);

            let user: User | undefined = undefined;

            try {
                user = await userManager.signinRedirectCallback(loginSuccessUrl);
            } catch {
                //NOTE: The user has likely pressed the back button just after logging in.
                return undefined;
            }

            return user;
        }

        restore_from_session: {
            const user = await userManager.getUser();

            if (user === null) {
                break restore_from_session;
            }

            // The server might have restarted and the session might have been lost.
            try {
                await userManager.signinSilent();
            } catch {
                return undefined;
            }

            return user;
        }

        restore_from_http_only_cookie: {
            const dLoginSuccessUrl = new Deferred<string | undefined>();

            const timeout = setTimeout(
                () =>
                    dLoginSuccessUrl.reject(
                        new Error(`SSO silent login timeout with clientId: ${clientId}`)
                    ),
                2500
            );

            const listener = (event: MessageEvent) => {
                if (typeof event.data !== "string") {
                    return;
                }

                const url = event.data;

                {
                    let result: ReturnType<typeof retrieveQueryParamFromUrl>;

                    try {
                        result = retrieveQueryParamFromUrl({ "name": configHashKey, url });
                    } catch {
                        // This could possibly happen if url is not a valid url.
                        return;
                    }

                    if (!result.wasPresent || result.value !== configHash) {
                        return;
                    }
                }

                clearTimeout(timeout);

                window.removeEventListener("message", listener);

                {
                    const result = retrieveQueryParamFromUrl({ "name": "error", url });

                    if (result.wasPresent) {
                        dLoginSuccessUrl.resolve(undefined);
                        return;
                    }
                }

                let loginSuccessUrl = "https://dummy.com";

                for (const name of paramsToRetrieveFromSuccessfulLogin) {
                    const result = retrieveQueryParamFromUrl({ name, url });

                    assert(result.wasPresent);

                    loginSuccessUrl = addQueryParamToUrl({
                        "url": loginSuccessUrl,
                        "name": name,
                        "value": result.value
                    }).newUrl;
                }

                dLoginSuccessUrl.resolve(loginSuccessUrl);
            };

            window.addEventListener("message", listener, false);

            userManager.signinSilent({ "silentRequestTimeoutInSeconds": 1 }).catch(() => {
                /* error expected */
            });

            const loginSuccessUrl = await dLoginSuccessUrl.pr;

            if (loginSuccessUrl === undefined) {
                break restore_from_http_only_cookie;
            }

            const user = await userManager.signinRedirectCallback(loginSuccessUrl);

            return user;
        }

        return undefined;
    })().then(
        user => {
            if (user === undefined) {
                return undefined;
            }

            const tokens = userToTokens(user);

            if (tokens.refreshTokenExpirationTime < tokens.accessTokenExpirationTime) {
                console.warn(
                    [
                        "The OIDC refresh token shorter than the one of the access token.",
                        "This is very unusual and probably a misconfiguration.",
                        `Check your oidc server configuration for ${clientId} ${issuerUri}`
                    ].join(" ")
                );
            }

            return tokens;
        },
        error => {
            assert(error instanceof Error);
            return error;
        }
    );

    const common: Oidc.Common = {
        "params": {
            issuerUri,
            clientId
        }
    };

    if (currentTokens instanceof Error) {
        const error = currentTokens;

        console.error(`The OIDC server is down or misconfigured: ${error.message}`);

        return id<Oidc.NotLoggedIn>({
            ...common,
            "isUserLoggedIn": false,
            "login": async () => {
                alert("Authentication is currently unavailable. Please try again later.");
                return new Promise<never>(() => {});
            }
        });
    }

    if (currentTokens === undefined) {
        return id<Oidc.NotLoggedIn>({
            ...common,
            "isUserLoggedIn": false,
            login
        });
    }

    const oidc = id<Oidc.LoggedIn>({
        ...common,
        "isUserLoggedIn": true,
        "getTokens": () => ({
            "accessToken": currentTokens.accessToken,
            "idToken": currentTokens.idToken,
            "refreshToken": currentTokens.refreshToken,
            "refreshTokenExpirationTime": currentTokens.refreshTokenExpirationTime,
            "accessTokenExpirationTime": currentTokens.accessTokenExpirationTime
        }),
        "logout": async params => {
            await userManager.signoutRedirect({
                "post_logout_redirect_uri": (() => {
                    switch (params.redirectTo) {
                        case "current page":
                            return window.location.href;
                        case "home":
                            return publicUrl;
                        case "specific url":
                            return params.url;
                    }
                    assert<Equals<typeof params, never>>(false);
                })()
            });
            return new Promise<never>(() => {});
        },
        "renewTokens": async () => {
            const user = await userManager.signinSilent();

            assert(user !== null);

            Object.assign(currentTokens, userToTokens(user));
        }
    });

    (function scheduleAutomaticRenew() {
        const msBeforeExpiration =
            Math.min(currentTokens.accessTokenExpirationTime, currentTokens.refreshTokenExpirationTime) -
            Date.now();

        setTimeout(async () => {
            try {
                await oidc.renewTokens();
            } catch {
                await login({ "doesCurrentHrefRequiresAuth": true });
            }

            scheduleAutomaticRenew();
        }, msBeforeExpiration - /* min validity in seconds */ 25 * 1000);
    })();

    return oidc;
}

function userToTokens(user: User): Oidc.Tokens {
    const accessToken = user.access_token;

    const accessTokenExpirationTime = (() => {
        read_from_metadata: {
            const { expires_at } = user;

            if (expires_at === undefined) {
                break read_from_metadata;
            }

            return expires_at * 1000;
        }

        read_from_jwt: {
            const expirationTime = readExpirationTimeInJwt(accessToken);

            if (expirationTime === undefined) {
                break read_from_jwt;
            }

            return expirationTime;
        }

        assert(false, "Failed to get access token expiration time");
    })();

    const refreshToken = user.refresh_token;

    assert(refreshToken !== undefined, "No refresh token provided by the oidc server");

    const refreshTokenExpirationTime = (() => {
        read_from_jwt: {
            const expirationTime = readExpirationTimeInJwt(refreshToken);

            if (expirationTime === undefined) {
                break read_from_jwt;
            }

            return expirationTime;
        }

        assert(false, "Failed to get refresh token expiration time");
    })();

    const idToken = user.id_token;

    assert(idToken !== undefined, "No id token provided by the oidc server");

    return {
        accessToken,
        accessTokenExpirationTime,
        refreshToken,
        refreshTokenExpirationTime,
        idToken
    };
}
