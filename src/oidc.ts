import { UserManager as OidcClientTsUserManager, type User as OidcClientTsUser } from "oidc-client-ts";
import { id } from "tsafe/id";
import { readExpirationTimeInJwt } from "./tools/readExpirationTimeInJwt";
import { assert, type Equals } from "tsafe/assert";
import { addQueryParamToUrl, retrieveQueryParamFromUrl } from "./tools/urlQueryParams";
import { fnv1aHashToHex } from "./tools/fnv1aHashToHex";
import { Deferred } from "./tools/Deferred";
import { decodeJwt } from "./tools/decodeJwt";
import { getDownlinkAndRtt } from "./tools/getDownlinkAndRtt";
import { createIsUserActive } from "./tools/createIsUserActive";
import { createStartCountdown } from "./tools/startCountdown";
import type { StatefulObservable } from "./tools/StatefulObservable";

export declare type Oidc<DecodedIdToken extends Record<string, unknown> = Record<string, unknown>> =
    | Oidc.LoggedIn<DecodedIdToken>
    | Oidc.NotLoggedIn;

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
        initializationError: OidcInitializationError | undefined;
    };

    export type LoggedIn<DecodedIdToken extends Record<string, unknown> = Record<string, unknown>> =
        Common & {
            isUserLoggedIn: true;
            renewTokens(): Promise<void>;
            getTokens: () => Tokens<DecodedIdToken>;
            subscribeToTokensChange: (onTokenChange: () => void) => { unsubscribe: () => void };
            logout: (
                params:
                    | { redirectTo: "home" | "current page" }
                    | { redirectTo: "specific url"; url: string }
            ) => Promise<never>;
            subscribeToAutoLogoutCountdown: (
                tickCallback: (params: { secondsLeft: number | undefined }) => void
            ) => { unsubscribeFromAutoLogoutCountdown: () => void };

            /**
             *
             * backFromLoginPages: The user has returned from the identity server's login pages. The session was established using query parameters provided by the identity server.
             * sessionStorageRestoration: The user just reloaded the page. An OIDC token stored in the session storage was used to restore the session.
             * silentSignin: Silent Single Sign-On (SSO) was achieved by creating an iframe to the identity server in the background. HttpOnly cookies were utilized to restore the session without redirecting the user to the login pages.
             */
            loginScenario: "backFromLoginPages" | "sessionStorageRestoration" | "silentSignin";
        };

    export type Tokens<DecodedIdToken extends Record<string, unknown> = Record<string, unknown>> =
        Readonly<{
            accessToken: string;
            accessTokenExpirationTime: number;
            idToken: string;
            refreshToken: string;
            refreshTokenExpirationTime: number;
            decodedIdToken: DecodedIdToken;
        }>;
}

export class OidcInitializationError extends Error {
    public readonly type: "server down" | "bad configuration" | "unknown";

    constructor(
        params:
            | {
                  type: "server down";
              }
            | {
                  type: "bad configuration";
                  timeoutDelayMs: number;
              }
            | {
                  type: "unknown";
                  cause: Error;
              }
    ) {
        super(
            (() => {
                switch (params.type) {
                    case "server down":
                        return "The OIDC server is down";
                    case "bad configuration":
                        return `Bad configuration. Timed out after ${params.timeoutDelayMs}ms`;
                    case "unknown":
                        return params.cause.message;
                }
            })(),
            // @ts-expect-error
            { "cause": params.type === "unknown" ? params.cause : undefined }
        );
        this.type = params.type;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

const paramsToRetrieveFromSuccessfulLogin = ["code", "state", "session_state", "iss"] as const;

export type ParamsOfCreateOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>
> = {
    issuerUri: string;
    clientId: string;
    clientSecret?: string;
    transformUrlBeforeRedirect?: (url: string) => string;
    /**
     * Extra query params to be added on the login url.
     * You can provide a function that returns those extra query params, it will be called
     * when login() is called.
     *
     * Example: extraQueryParams: ()=> ({ ui_locales: "fr" })
     */
    extraQueryParams?: Record<string, string> | (() => Record<string, string>);
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
    decodedIdTokenSchema?: { parse: (data: unknown) => DecodedIdToken };
    /**
     * This parameter defines after how many seconds of inactivity the user should be
     * logged out automatically.
     *
     * WARNING: It should be configured on the identity server side
     * as it's the authoritative source for security policies and not the client.
     * If you don't provide this parameter it will be inferred from the refresh token expiration time.
     * */
    __unsafe_ssoSessionIdleSeconds?: number;
};

let $isUserActive: StatefulObservable<boolean> | undefined = undefined;
const hotReloadCleanups = new Map<string, Set<() => void>>();

/** @see: https://github.com/garronej/oidc-spa#option-1-usage-without-involving-the-ui-framework */
export async function createOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>
>(params: ParamsOfCreateOidc<DecodedIdToken>): Promise<Oidc<DecodedIdToken>> {
    const {
        issuerUri,
        clientId,
        clientSecret,
        transformUrlBeforeRedirect = url => url,
        extraQueryParams: extraQueryParamsOrGetter,
        publicUrl: publicUrl_params,
        decodedIdTokenSchema,
        __unsafe_ssoSessionIdleSeconds
    } = params;

    const getExtraQueryParams = (() => {
        if (typeof extraQueryParamsOrGetter === "function") {
            return extraQueryParamsOrGetter;
        }

        if (extraQueryParamsOrGetter !== undefined) {
            return () => extraQueryParamsOrGetter;
        }

        return undefined;
    })();

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

    {
        hotReloadCleanups.get(configHash)?.forEach(cleanup => cleanup());
        hotReloadCleanups.set(configHash, new Set());
    }

    const configHashKey = "configHash";

    const oidcClientTsUserManager = new OidcClientTsUserManager({
        "authority": issuerUri,
        "client_id": clientId,
        "client_secret": clientSecret,
        "redirect_uri": "" /* provided when calling login */,
        "response_type": "code",
        "scope": "openid profile",
        "automaticSilentRenew": false,
        "silent_redirect_uri": `${publicUrl}/silent-sso.html?${configHashKey}=${configHash}`
    });

    // NOTE: Only useful for Firefox, see note bellow.
    let lastPublicRoute: string | undefined = undefined;

    // NOTE: To call only if not logged in.
    const startTrackingLastPublicRoute = () => {
        const realPushState = history.pushState.bind(history);
        history.pushState = function pushState(...args) {
            lastPublicRoute = window.location.href;
            return realPushState(...args);
        };
    };

    let hasLoginBeenCalled = false;

    const login: Oidc.NotLoggedIn["login"] = async ({
        doesCurrentHrefRequiresAuth,
        extraQueryParams
    }) => {
        //NOTE: We know there is a extraQueryParameter option but it doesn't allow
        // to control the encoding so we have to highjack global URL Class that is
        // used internally by oidc-client-ts. It's save to do so since this is the
        // last thing that will be done before the redirect.

        if (hasLoginBeenCalled) {
            return new Promise<never>(() => {});
        }

        hasLoginBeenCalled = true;

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
            // NOTE: In Firefox, when the user navigate back from the login page
            // the state of the app is restored. We don't want that to happen,
            // we want to redirect the user to the last public page.
            const callback = () => {
                if (document.visibilityState === "visible") {
                    document.removeEventListener("visibilitychange", callback);

                    if (lastPublicRoute !== undefined) {
                        window.location.href = lastPublicRoute;
                    } else {
                        window.history.back();
                    }
                }
            };
            document.addEventListener("visibilitychange", callback);
        }

        await oidcClientTsUserManager.signinRedirect({
            redirect_uri,
            // NOTE: This is for the behavior when the use presses the back button on the login pages.
            // This is what happens when the user gave up the login process.
            // We want to that to redirect to the last public page.
            "redirectMethod": doesCurrentHrefRequiresAuth ? "replace" : "assign"
        });
        return new Promise<never>(() => {});
    };

    const resultOfLoginProcess = await (async function getUser() {
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

                if (!result.wasPresent) {
                    if (name === "iss") {
                        continue;
                    }
                    throw new Error(`Missing query param: ${name}`);
                }

                loginSuccessUrl = addQueryParamToUrl({
                    "url": loginSuccessUrl,
                    "name": name,
                    "value": result.value
                }).newUrl;

                url = result.newUrl;
            }

            window.history.pushState(null, "", url);

            let oidcClientTsUser: OidcClientTsUser | undefined = undefined;

            try {
                oidcClientTsUser = await oidcClientTsUserManager.signinRedirectCallback(loginSuccessUrl);
            } catch {
                //NOTE: The user has likely pressed the back button just after logging in.
                return undefined;
            }

            return {
                "loginScenario": "backFromLoginPages" as const,
                oidcClientTsUser
            };
        }

        restore_from_session: {
            const oidcClientTsUser = await oidcClientTsUserManager.getUser();

            if (oidcClientTsUser === null) {
                break restore_from_session;
            }

            // The server might have restarted and the session might have been lost.
            try {
                await oidcClientTsUserManager.signinSilent();
            } catch (error) {
                assert(error instanceof Error);

                if (error.message === "Failed to fetch") {
                    throw new OidcInitializationError({ "type": "server down" });
                }

                return undefined;
            }

            return {
                "loginScenario": "sessionStorageRestoration" as const,
                oidcClientTsUser
            };
        }

        restore_from_http_only_cookie: {
            const dLoginSuccessUrl = new Deferred<string | undefined>();

            const timeoutDelayMs = (() => {
                const downlinkAndRtt = getDownlinkAndRtt();

                if (downlinkAndRtt === undefined) {
                    return 5000;
                }

                const { downlink, rtt } = downlinkAndRtt;

                // Base delay is the minimum delay we're willing to tolerate
                const baseDelay = 3000;

                // Calculate dynamic delay based on RTT and downlink
                // Add 1 to downlink to avoid division by zero
                const dynamicDelay = rtt * 2.5 + 3000 / (downlink + 1);

                return Math.max(baseDelay, dynamicDelay);
            })();

            const timeout = setTimeout(
                () =>
                    dLoginSuccessUrl.reject(
                        new OidcInitializationError({
                            "type": "bad configuration",
                            timeoutDelayMs
                        })
                    ),
                timeoutDelayMs
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

                    if (!result.wasPresent) {
                        if (name === "iss") {
                            continue;
                        }
                        throw new Error(`Missing query param: ${name}`);
                    }

                    loginSuccessUrl = addQueryParamToUrl({
                        "url": loginSuccessUrl,
                        "name": name,
                        "value": result.value
                    }).newUrl;
                }

                dLoginSuccessUrl.resolve(loginSuccessUrl);
            };

            window.addEventListener("message", listener, false);

            oidcClientTsUserManager
                .signinSilent({ "silentRequestTimeoutInSeconds": timeoutDelayMs / 1000 })
                .catch((error: Error) => {
                    if (error.message === "Failed to fetch") {
                        clearTimeout(timeout);

                        dLoginSuccessUrl.reject(new OidcInitializationError({ "type": "server down" }));
                    }
                });

            const loginSuccessUrl = await dLoginSuccessUrl.pr;

            if (loginSuccessUrl === undefined) {
                break restore_from_http_only_cookie;
            }

            const oidcClientTsUser = await oidcClientTsUserManager.signinRedirectCallback(
                loginSuccessUrl
            );

            return {
                "loginScenario": "silentSignin" as const,
                oidcClientTsUser
            };
        }

        return undefined;
    })().then(
        //oidcClientTsUser => {
        result => {
            if (result === undefined) {
                return undefined;
            }

            const { oidcClientTsUser, loginScenario } = result;

            const tokens = oidcClientTsUserToTokens({
                oidcClientTsUser,
                decodedIdTokenSchema
            });

            if (tokens.refreshTokenExpirationTime < tokens.accessTokenExpirationTime) {
                console.warn(
                    [
                        "The OIDC refresh token shorter than the one of the access token.",
                        "This is very unusual and probably a misconfiguration.",
                        `Check your oidc server configuration for ${clientId} ${issuerUri}`
                    ].join(" ")
                );
            }

            return { tokens, loginScenario };
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

    if (resultOfLoginProcess instanceof Error) {
        const error = resultOfLoginProcess;

        const initializationError =
            error instanceof OidcInitializationError
                ? error
                : new OidcInitializationError({
                      "type": "unknown",
                      "cause": error
                  });

        console.error(`OIDC initialization error: ${initializationError.message}`);

        startTrackingLastPublicRoute();

        return id<Oidc.NotLoggedIn>({
            ...common,
            "isUserLoggedIn": false,
            "login": async () => {
                alert("Authentication is currently unavailable. Please try again later.");
                return new Promise<never>(() => {});
            },
            initializationError
        });
    }

    if (resultOfLoginProcess === undefined) {
        startTrackingLastPublicRoute();

        return id<Oidc.NotLoggedIn>({
            ...common,
            "isUserLoggedIn": false,
            login,
            "initializationError": undefined
        });
    }

    let currentTokens = resultOfLoginProcess.tokens;

    const autoLogoutCountdownTickCallback = new Set<
        (params: { secondsLeft: number | undefined }) => void
    >();

    const onTokenChanges = new Set<() => void>();

    const oidc = id<Oidc.LoggedIn<DecodedIdToken>>({
        ...common,
        "isUserLoggedIn": true,
        "getTokens": () => currentTokens,
        "logout": async params => {
            await oidcClientTsUserManager.signoutRedirect({
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
            const oidcClientTsUser = await oidcClientTsUserManager.signinSilent();

            assert(oidcClientTsUser !== null);

            const decodedIdTokenPropertyDescriptor = Object.getOwnPropertyDescriptor(
                currentTokens,
                "decodedIdToken"
            );

            assert(decodedIdTokenPropertyDescriptor !== undefined);

            currentTokens = oidcClientTsUserToTokens({
                oidcClientTsUser,
                decodedIdTokenSchema
            });

            // NOTE: We do that to preserve the cache and the object reference.
            Object.defineProperty(currentTokens, "decodedIdToken", decodedIdTokenPropertyDescriptor);

            onTokenChanges.forEach(onTokenChange => onTokenChange());
        },
        "subscribeToTokensChange": onTokenChange => {
            onTokenChanges.add(onTokenChange);

            return {
                "unsubscribe": () => {
                    onTokenChanges.delete(onTokenChange);
                }
            };
        },
        "subscribeToAutoLogoutCountdown": tickCallback => {
            autoLogoutCountdownTickCallback.add(tickCallback);

            const unsubscribeFromAutoLogoutCountdown = () => {
                autoLogoutCountdownTickCallback.delete(tickCallback);
            };

            return { unsubscribeFromAutoLogoutCountdown };
        },
        "loginScenario": resultOfLoginProcess.loginScenario
    });

    {
        const getMsBeforeExpiration = () => {
            // NOTE: In general the access token is supposed to have a shorter
            // lifespan than the refresh token but we don't want to make any
            // assumption here.
            const tokenExpirationTime = Math.min(
                currentTokens.accessTokenExpirationTime,
                currentTokens.refreshTokenExpirationTime
            );

            return tokenExpirationTime - Date.now();
        };

        // NOTE: We refresh the token 25 seconds before it expires.
        // If the token expiration time is less than 25 seconds we refresh the token when
        // only 1/10 of the token time is left.
        const renewMsBeforeExpires = Math.min(25_000, getMsBeforeExpiration() * 0.1);

        (function scheduleRenew() {
            const timer = setTimeout(async () => {
                tokenChangeUnsubscribe();

                try {
                    await oidc.renewTokens();
                } catch {
                    // NOTE: Here semantically it's wrong. The user may very well be
                    // on a page that require auth.
                    // However there's no way to enforce the browser to redirect back to
                    // the last public route if the user press back on the login page.
                    // This is due to the fact that pushing to history only works if it's
                    // triggered by a user interaction.
                    await login({ "doesCurrentHrefRequiresAuth": false });
                }

                scheduleRenew();
            }, getMsBeforeExpiration() - renewMsBeforeExpires);

            const { unsubscribe: tokenChangeUnsubscribe } = oidc.subscribeToTokensChange(() => {
                clearTimeout(timer);
                tokenChangeUnsubscribe();
                scheduleRenew();
            });
        })();
    }

    {
        const { startCountdown } = createStartCountdown({
            "getCountdownEndTime": () =>
                __unsafe_ssoSessionIdleSeconds ?? currentTokens.refreshTokenExpirationTime,
            "tickCallback": ({ secondsLeft }) => {
                autoLogoutCountdownTickCallback.forEach(tickCallback => tickCallback({ secondsLeft }));

                if (secondsLeft === 0) {
                    oidc.logout({ "redirectTo": "current page" });
                }
            }
        });

        let stopCountdown: (() => void) | undefined = undefined;

        if ($isUserActive === undefined) {
            $isUserActive = createIsUserActive({
                "theUserIsConsideredInactiveAfterMsOfInactivity": 5_000
            }).$isUserActive;
        }

        const { unsubscribe: unsubscribeFrom$isUserActive } = $isUserActive.subscribe(isUserActive => {
            if (isUserActive) {
                if (stopCountdown !== undefined) {
                    stopCountdown();
                    stopCountdown = undefined;
                }
            } else {
                assert(stopCountdown === undefined);
                stopCountdown = startCountdown().stopCountdown;
            }
        });

        {
            const hotReloadCleanupsForThisConfig = hotReloadCleanups.get(configHash);
            assert(hotReloadCleanupsForThisConfig !== undefined);
            hotReloadCleanupsForThisConfig.add(() => {
                unsubscribeFrom$isUserActive();
                stopCountdown?.();
            });
        }
    }

    return oidc;
}

function oidcClientTsUserToTokens<DecodedIdToken extends Record<string, unknown>>(params: {
    oidcClientTsUser: OidcClientTsUser;
    decodedIdTokenSchema?: { parse: (data: unknown) => DecodedIdToken };
}): Oidc.Tokens<DecodedIdToken> {
    const { oidcClientTsUser, decodedIdTokenSchema } = params;

    const accessToken = oidcClientTsUser.access_token;

    const accessTokenExpirationTime = (() => {
        read_from_metadata: {
            const { expires_at } = oidcClientTsUser;

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

    const refreshToken = oidcClientTsUser.refresh_token;

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

    const idToken = oidcClientTsUser.id_token;

    assert(idToken !== undefined, "No id token provided by the oidc server");

    const tokens: Oidc.Tokens<DecodedIdToken> = {
        accessToken,
        accessTokenExpirationTime,
        refreshToken,
        refreshTokenExpirationTime,
        idToken,
        "decodedIdToken": null as any
    };

    let cache:
        | {
              idToken: string;
              decodedIdToken: DecodedIdToken;
          }
        | undefined = undefined;

    Object.defineProperty(tokens, "decodedIdToken", {
        "get": function (this: Oidc.Tokens<DecodedIdToken>) {
            if (cache !== undefined && cache.idToken === this.idToken) {
                return cache.decodedIdToken;
            }

            let decodedIdToken = decodeJwt(this.idToken) as DecodedIdToken;

            if (decodedIdTokenSchema !== undefined) {
                decodedIdToken = decodedIdTokenSchema.parse(decodedIdToken);
            }

            cache = {
                "idToken": this.idToken,
                decodedIdToken
            };

            return decodedIdToken;
        },
        "configurable": true,
        "enumerable": true
    });

    return tokens;
}
