import {
    UserManager as OidcClientTsUserManager,
    type User as OidcClientTsUser
} from "./vendor/oidc-client-ts-and-jwt-decode";
import { id } from "./vendor/tsafe";
import { readExpirationTimeInJwt } from "./tools/readExpirationTimeInJwt";
import { assert, type Equals } from "./vendor/tsafe";
import { addQueryParamToUrl, retrieveQueryParamFromUrl } from "./tools/urlQueryParams";
import { fnv1aHashToHex } from "./tools/fnv1aHashToHex";
import { Deferred } from "./tools/Deferred";
import { decodeJwt } from "./tools/decodeJwt";
import { getDownlinkAndRtt } from "./tools/getDownlinkAndRtt";
import { createIsUserActive } from "./tools/createIsUserActive";
import { createStartCountdown } from "./tools/startCountdown";
import type { StatefulObservable } from "./tools/StatefulObservable";
import { setTimeout, clearTimeout } from "./vendor/worker-timers";

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
            /**
             * Where to redirect after successful login.
             * Default: window.location.href (here)
             *
             * It does not need to include the origin, eg: "/dashboard"
             */
            redirectUrl?: string;
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
                  issuerUri: string;
              }
            | {
                  type: "bad configuration";
                  likelyCause:
                      | {
                            // Most likely redirect URIs or the client does not exist.
                            type: "misconfigured OIDC client";
                            clientId: string;
                            timeoutDelayMs: number;
                            publicUrl: string | undefined;
                        }
                      | {
                            type: "not in Web Origins";
                            clientId: string;
                        }
                      | {
                            type: "silent-sso.html not reachable";
                            silentSsoHtmlUrl: string;
                        }
                      | {
                            type: "frame-ancestors none";
                            silentSso: {
                                hasDedicatedHtmlFile: boolean;
                                redirectUri: string;
                            };
                        };
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
                        return [
                            `The OIDC server seems to be down.`,
                            `If you know it's not the case it means that the issuerUri: ${params.issuerUri} is incorrect.`,
                            `If you are using Keycloak makes sure that the realm exists and that the url is well formed.\n`,
                            `More info: https://docs.oidc-spa.dev/resources/usage-with-keycloak`
                        ].join(" ");
                    case "bad configuration":
                        switch (params.likelyCause.type) {
                            case "misconfigured OIDC client":
                                return [
                                    `The OIDC client ${params.likelyCause.clientId} seems to be misconfigured on your OIDC server.`,
                                    `If you are using Keycloak you likely need to add "${
                                        params.likelyCause.publicUrl ?? window.location.origin
                                    }/*" to the list of Valid Redirect URIs`,
                                    `in the ${params.likelyCause.clientId} client configuration.\n`,
                                    `More info: https://docs.oidc-spa.dev/resources/usage-with-keycloak`,
                                    `Silent SSO timed out after ${params.likelyCause.timeoutDelayMs}ms.`
                                ].join(" ");
                            case "not in Web Origins":
                                return [
                                    `It seems that there is a CORS issue.`,
                                    `If you are using Keycloak check the "Web Origins" option in your ${params.likelyCause.clientId} client configuration.`,
                                    `You should probably add "${location.origin}/*" to the list.`,
                                    `More info: https://docs.oidc-spa.dev/resources/usage-with-keycloak`
                                ].join(" ");
                            case "silent-sso.html not reachable":
                                return [
                                    `${params.likelyCause.silentSsoHtmlUrl} is not reachable. Make sure you've created the silent-sso.html file`,
                                    `in your public directory. More info: https://docs.oidc-spa.dev/documentation/installation`
                                ].join(" ");
                            case "frame-ancestors none":
                                return [
                                    params.likelyCause.silentSso.hasDedicatedHtmlFile
                                        ? `The silent-sso.html file, `
                                        : `The URI used for Silent SSO, `,
                                    `${params.likelyCause.silentSso.redirectUri}, `,
                                    "is served by your web server with the HTTP header `Content-Security-Policy: frame-ancestors none` in the response.\n",
                                    "This header prevents the silent sign-in process from working.\n",
                                    "To fix this issue, you should configure your web server to not send this header or to use `frame-ancestors self` instead of `frame-ancestors none`.\n",
                                    "If you use Nginx, you can replace:\n",
                                    `add_header Content-Security-Policy "frame-ancestors 'none'";\n`,
                                    "with:\n",
                                    `map $uri $add_content_security_policy {\n`,
                                    `   "~*silent-sso\.html$" "frame-ancestors 'self'";\n`,
                                    `   default "frame-ancestors 'none'";\n`,
                                    `}\n`,
                                    `add_header Content-Security-Policy $add_content_security_policy;\n`
                                ].join(" ");
                        }
                    case "unknown":
                        return params.cause.message;
                }
                assert<Equals<typeof params, never>>(false);
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
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    IsAuthGloballyRequired extends boolean = false
> = {
    issuerUri: string;
    clientId: string;
    clientSecret?: string;
    /**
     * Transform the url before redirecting to the login pages.
     */
    transformUrlBeforeRedirect?: (url: string) => string;
    /**
     * Extra query params to be added on the login url.
     * You can provide a function that returns those extra query params, it will be called
     * when login() is called.
     *
     * Example: extraQueryParams: ()=> ({ ui_locales: "fr" })
     *
     * This parameter can also be passed to login() directly.
     */
    extraQueryParams?: Record<string, string> | (() => Record<string, string>);
    /**
     * Where to redirect after successful login.
     * Default: window.location.href (here)
     *
     * It does not need to include the origin, eg: "/dashboard"
     *
     * This parameter can also be passed to login() directly as `redirectUrl`.
     */
    postLoginRedirectUrl?: string;
    /**
     * This parameter is used to let oidc-spa knows where to find the silent-sso.html file
     * and also to know what is the root path of your application so it can redirect to it after logout.
     *   - `${publicUrl}/silent-sso.html` must return the `silent-sso.html` that you are supposed to have created in your `public/` directory.
     *   - Navigating to publicUrl should redirect to the home of your App.
     *
     * What should you put in this parameter?
     *   - Vite project:             `publicUrl: import.meta.env.BASE_URL`
     *   - Create React App project: `publicUrl: process.env.PUBLIC_URL`
     *   - Other:                    `publicUrl: "/"` (Usually, or `/my-app-name` if your app is not at the root of the domain)
     *
     * If you've opted out of using the `silent-sso.html` file you can set `publicUrl` to `undefined`.
     * Just be aware that calling `logout({ redirectTo: "home" })` will throw an error.
     * Use `logout({ redirectTo: "specific url", url: "/..." })` or `logout({ redirectTo: "current page" })` instead.
     */
    publicUrl: string | undefined;
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

    autoLogoutParams?: Parameters<Oidc.LoggedIn<any>["logout"]>[0];
    isAuthGloballyRequired?: IsAuthGloballyRequired;
};

let $isUserActive: StatefulObservable<boolean> | undefined = undefined;
const hotReloadCleanups = new Map<string, Set<() => void>>();

const URL_real = window.URL;

/** @see: https://github.com/garronej/oidc-spa#option-1-usage-without-involving-the-ui-framework */
export async function createOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    IsAuthGloballyRequired extends boolean = false
>(
    params: ParamsOfCreateOidc<DecodedIdToken, IsAuthGloballyRequired>
): Promise<IsAuthGloballyRequired extends true ? Oidc.LoggedIn<DecodedIdToken> : Oidc<DecodedIdToken>> {
    const {
        issuerUri,
        clientId,
        clientSecret,
        transformUrlBeforeRedirect = url => url,
        extraQueryParams: extraQueryParamsOrGetter,
        publicUrl: publicUrl_params,
        decodedIdTokenSchema,
        __unsafe_ssoSessionIdleSeconds,
        autoLogoutParams = { "redirectTo": "current page" },
        isAuthGloballyRequired = false,
        postLoginRedirectUrl
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
            return undefined;
        }

        return (
            publicUrl_params.startsWith("http")
                ? publicUrl_params
                : `${window.location.origin}${publicUrl_params}`
        ).replace(/\/$/, "");
    })();

    const configHash = fnv1aHashToHex(`${issuerUri} ${clientId}`);

    {
        const cleanups = hotReloadCleanups.get(configHash);

        if (cleanups !== undefined) {
            Array.from(cleanups ?? []).forEach(cleanup => cleanup());
        }

        hotReloadCleanups.set(configHash, new Set());
    }

    const configHashKey = "configHash";

    const silentSso =
        publicUrl === undefined
            ? {
                  "hasDedicatedHtmlFile": false,
                  "redirectUri": window.location.href
              }
            : {
                  "hasDedicatedHtmlFile": true,
                  "redirectUri": `${publicUrl}/silent-sso.html`
              };

    const silentSsoKey = "oidcSpaSilentSso";

    silent_sso_polyfill: {
        if (
            !retrieveQueryParamFromUrl({
                "url": window.location.href,
                "name": silentSsoKey
            }).wasPresent
        ) {
            break silent_sso_polyfill;
        }

        {
            const result = retrieveQueryParamFromUrl({
                "url": window.location.href,
                "name": configHashKey
            });

            if (!result.wasPresent || result.value !== configHash) {
                break silent_sso_polyfill;
            }
        }

        if (silentSso.hasDedicatedHtmlFile) {
            // Here the user forget to create the silent-sso.html file or or the web server is not serving it correctly
            // we shouldn't fall back to the SPA page.
            // In this case we want to let the timeout of the parent expire to provide the correct error message.
            await new Promise<never>(() => {});
        }

        parent.postMessage(location.href, location.origin);

        await new Promise<never>(() => {});
    }

    const oidcClientTsUserManager = new OidcClientTsUserManager({
        "authority": issuerUri,
        "client_id": clientId,
        "client_secret": clientSecret,
        "redirect_uri": "" /* provided when calling login */,
        "response_type": "code",
        "scope": "openid profile",
        "automaticSilentRenew": false,
        "silent_redirect_uri": (() => {
            let { redirectUri } = silentSso;

            redirectUri = addQueryParamToUrl({
                "url": redirectUri,
                "name": configHashKey,
                "value": configHash
            }).newUrl;

            redirectUri = addQueryParamToUrl({
                "url": redirectUri,
                "name": silentSsoKey,
                "value": "true"
            }).newUrl;

            return redirectUri;
        })()
    });

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
        extraQueryParams,
        redirectUrl
    }) => {
        if (hasLoginBeenCalled) {
            return new Promise<never>(() => {});
        }

        hasLoginBeenCalled = true;

        const { newUrl: redirect_uri } = addQueryParamToUrl({
            "url": (() => {
                if (redirectUrl === undefined) {
                    return window.location.href;
                }
                return redirectUrl.startsWith("/")
                    ? `${window.location.origin}${redirectUrl}`
                    : redirectUrl;
            })(),
            "name": configHashKey,
            "value": configHash
        });

        // NOTE: This is for handling cases when user press the back button on the login pages.
        // When the app is hosted on https (so not in dev mode) the browser will restore the state of the app
        // instead of reloading the page.
        {
            const callback = () => {
                if (document.visibilityState === "visible") {
                    document.removeEventListener("visibilitychange", callback);

                    if (doesCurrentHrefRequiresAuth) {
                        if (lastPublicRoute !== undefined) {
                            window.location.href = lastPublicRoute;
                        } else {
                            window.history.back();
                        }
                    } else {
                        hasLoginBeenCalled = false;
                    }
                }
            };
            document.addEventListener("visibilitychange", callback);
        }

        //NOTE: We know there is a extraQueryParameter option but it doesn't allow
        // to control the encoding so we have to highjack global URL Class that is
        // used internally by oidc-client-ts. It's save to do so since this is the
        // last thing that will be done before the redirect.
        {
            const URL = (...args: ConstructorParameters<typeof URL_real>) => {
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

                            Object.defineProperty(window, "URL", { "value": URL_real });

                            return url;
                        }

                        //@ts-expect-error
                        return target[prop];
                    }
                });
            };

            Object.defineProperty(window, "URL", { "value": URL });
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

            let loginSuccessUrl = "https://dummy.com";

            let missingMandatoryParams: string[] = [];

            for (const name of paramsToRetrieveFromSuccessfulLogin) {
                const result = retrieveQueryParamFromUrl({ name, url });

                if (!result.wasPresent) {
                    if (name === "iss") {
                        continue;
                    }
                    missingMandatoryParams.push(name);
                    continue;
                }

                loginSuccessUrl = addQueryParamToUrl({
                    "url": loginSuccessUrl,
                    "name": name,
                    "value": result.value
                }).newUrl;

                url = result.newUrl;
            }

            window.history.pushState(null, "", url);

            {
                const result = retrieveQueryParamFromUrl({ "name": "error", url });

                if (result.wasPresent) {
                    throw new Error(
                        [
                            "The OIDC server responded with an error passed as query parameter after the login process",
                            `this error is: ${result.value}`
                        ].join(" ")
                    );
                }
            }

            if (missingMandatoryParams.length !== 0) {
                throw new Error(
                    [
                        "After the login process the following mandatory OIDC query parameters where missing:",
                        missingMandatoryParams.join(", ")
                    ].join(" ")
                );
            }

            let oidcClientTsUser: OidcClientTsUser | undefined = undefined;

            try {
                oidcClientTsUser = await oidcClientTsUserManager.signinRedirectCallback(loginSuccessUrl);
            } catch (error) {
                assert(error instanceof Error);

                if (error.message === "Failed to fetch") {
                    // If it's a fetch error here we know that the web server is not down and the login was successful,
                    // we just where redirected from the login pages.
                    // This means it's likely a "Web origins" misconfiguration.
                    throw new OidcInitializationError({
                        "type": "bad configuration",
                        "likelyCause": {
                            "type": "not in Web Origins",
                            clientId
                        }
                    });
                }

                //NOTE: The user has likely pressed the back button just after logging in.
                //UPDATE: I don't remember how to reproduce this case and I don't know if it's still relevant.
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
                    // Here it could be web origins as well but it's less likely because
                    // it would mean that there was once a valid configuration and it has been
                    // changed to an invalid one before the token expired.
                    // but the server is not necessarily down, the issuerUri could be wrong.
                    // So the error that we return should be either "server down" if fetching the
                    // well known configuration endpoint failed without returning any status code
                    // or "bad configuration" if the endpoint returned a 404 or an other status code.
                    throw new OidcInitializationError({
                        "type": "server down",
                        issuerUri
                    });
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

            const timeout = setTimeout(async () => {
                let dedicatedSilentSsoHtmlFileCsp: string | null | undefined = undefined;

                silent_sso_html_unreachable: {
                    if (!silentSso.hasDedicatedHtmlFile) {
                        break silent_sso_html_unreachable;
                    }

                    const isSilentSsoHtmlReachable = await fetch(silentSso.redirectUri).then(
                        async response => {
                            dedicatedSilentSsoHtmlFileCsp =
                                response.headers.get("Content-Security-Policy");

                            const content = await response.text();

                            return (
                                content.length < 250 &&
                                content.includes("parent.postMessage(location.href")
                            );
                        },
                        () => false
                    );

                    if (isSilentSsoHtmlReachable) {
                        break silent_sso_html_unreachable;
                    }

                    dLoginSuccessUrl.reject(
                        new OidcInitializationError({
                            "type": "bad configuration",
                            "likelyCause": {
                                "type": "silent-sso.html not reachable",
                                "silentSsoHtmlUrl": silentSso.redirectUri
                            }
                        })
                    );
                    return;
                }

                frame_ancestors_none: {
                    const csp = await (async () => {
                        if (silentSso.hasDedicatedHtmlFile) {
                            assert(dedicatedSilentSsoHtmlFileCsp !== undefined);
                            return dedicatedSilentSsoHtmlFileCsp;
                        }

                        const csp = await fetch(silentSso.redirectUri).then(
                            response => response.headers.get("Content-Security-Policy"),
                            error => id<Error>(error)
                        );

                        if (csp instanceof Error) {
                            dLoginSuccessUrl.reject(
                                new Error(`Failed to fetch ${silentSso.redirectUri}: ${csp.message}`)
                            );
                            return new Promise<never>(() => {});
                        }

                        return csp;
                    })();

                    if (csp === null) {
                        break frame_ancestors_none;
                    }

                    const hasFrameAncestorsNone = csp
                        .replace(/["']/g, "")
                        .replace(/\s+/g, " ")
                        .toLowerCase()
                        .includes("frame-ancestors none");

                    if (!hasFrameAncestorsNone) {
                        break frame_ancestors_none;
                    }

                    dLoginSuccessUrl.reject(
                        new OidcInitializationError({
                            "type": "bad configuration",
                            "likelyCause": {
                                "type": "frame-ancestors none",
                                silentSso
                            }
                        })
                    );
                    return;
                }

                // Here we know that the server is not down and that the issuer_uri is correct
                // otherwise we would have had a fetch error when loading the iframe.
                // So this means that it's very likely a OIDC client misconfiguration.
                // It could also be a very slow network but this risk is mitigated by the fact that we check
                // for the network speed to adjust the timeout delay.
                dLoginSuccessUrl.reject(
                    new OidcInitializationError({
                        "type": "bad configuration",
                        "likelyCause": {
                            "type": "misconfigured OIDC client",
                            clientId,
                            timeoutDelayMs,
                            publicUrl
                        }
                    })
                );
            }, timeoutDelayMs);

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

                const missingMandatoryParams: string[] = [];

                for (const name of paramsToRetrieveFromSuccessfulLogin) {
                    const result = retrieveQueryParamFromUrl({ name, url });

                    if (!result.wasPresent) {
                        if (name === "iss") {
                            continue;
                        }
                        missingMandatoryParams.push(name);
                        continue;
                    }

                    loginSuccessUrl = addQueryParamToUrl({
                        "url": loginSuccessUrl,
                        "name": name,
                        "value": result.value
                    }).newUrl;
                }

                if (missingMandatoryParams.length !== 0) {
                    dLoginSuccessUrl.reject(
                        new Error(
                            [
                                "After the silent signin process the following mandatory OIDC query parameters where missing:",
                                missingMandatoryParams.join(", ")
                            ].join(" ")
                        )
                    );
                    return;
                }

                dLoginSuccessUrl.resolve(loginSuccessUrl);
            };

            window.addEventListener("message", listener, false);

            oidcClientTsUserManager
                .signinSilent({ "silentRequestTimeoutInSeconds": timeoutDelayMs / 1000 })
                .catch((error: Error) => {
                    if (error.message === "Failed to fetch") {
                        clearTimeout(timeout);

                        // Here we know it's not web origin because it's not the token we are fetching
                        // but just the well known configuration endpoint that is not subject to CORS.
                        dLoginSuccessUrl.reject(
                            new OidcInitializationError({
                                "type": "server down",
                                issuerUri
                            })
                        );
                    }
                });

            const loginSuccessUrl = await dLoginSuccessUrl.pr;

            if (loginSuccessUrl === undefined) {
                break restore_from_http_only_cookie;
            }

            let oidcClientTsUser: OidcClientTsUser | undefined = undefined;

            try {
                oidcClientTsUser = await oidcClientTsUserManager.signinRedirectCallback(loginSuccessUrl);
            } catch (error) {
                assert(error instanceof Error);

                if (error.message === "Failed to fetch") {
                    // If we have a fetch error here. We know for sure that the server isn't down,
                    // the silent sign-in was successful. We also know that the issuer_uri is correct.
                    // so it's very likely the web origins that are misconfigured.
                    throw new OidcInitializationError({
                        "type": "bad configuration",
                        "likelyCause": {
                            "type": "not in Web Origins",
                            clientId
                        }
                    });
                }

                throw error;
            }

            return {
                "loginScenario": "silentSignin" as const,
                oidcClientTsUser
            };
        }

        return undefined;
    })().then(
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

        if (isAuthGloballyRequired) {
            throw initializationError;
        }

        console.error(
            `OIDC initialization error of type "${initializationError.type}": ${initializationError.message}`
        );

        startTrackingLastPublicRoute();

        const oidc = id<Oidc.NotLoggedIn>({
            ...common,
            "isUserLoggedIn": false,
            "login": async () => {
                alert("Authentication is currently unavailable. Please try again later.");
                return new Promise<never>(() => {});
            },
            initializationError
        });

        // @ts-expect-error: We know what we are doing.
        return oidc;
    }

    if (resultOfLoginProcess === undefined) {
        if (isAuthGloballyRequired) {
            await login({
                "doesCurrentHrefRequiresAuth": true,
                "redirectUrl": postLoginRedirectUrl
            });
        }

        startTrackingLastPublicRoute();

        const oidc = id<Oidc.NotLoggedIn>({
            ...common,
            "isUserLoggedIn": false,
            login,
            "initializationError": undefined
        });

        // @ts-expect-error: We know what we are doing.
        return oidc;
    }

    let currentTokens = resultOfLoginProcess.tokens;

    const autoLogoutCountdownTickCallbacks = new Set<
        (params: { secondsLeft: number | undefined }) => void
    >();

    const onTokenChanges = new Set<() => void>();

    const oidc = id<Oidc.LoggedIn<DecodedIdToken>>({
        ...common,
        "isUserLoggedIn": true,
        "getTokens": () => currentTokens,
        "logout": async params => {
            await oidcClientTsUserManager.signoutRedirect({
                "post_logout_redirect_uri": ((): string => {
                    switch (params.redirectTo) {
                        case "current page":
                            return window.location.href;
                        case "home":
                            if (publicUrl === undefined) {
                                throw new Error(
                                    [
                                        "Since you've opted out of the `silent-sso.html` file you are probably in a",
                                        "setup a bit less standard. To avoid any confusion on where the users should be",
                                        "redirected after logout please explicitly specify the url to redirect to.",
                                        "With `logout({ redirectTo: 'specific url', url: '/my-home' })` or use",
                                        "`logout({ redirectTo: 'current page' })` if you want to redirect to the current page."
                                    ].join(" ")
                                );
                            }
                            return publicUrl;
                        case "specific url":
                            return params.url.startsWith("/")
                                ? `${window.location.origin}${params.url}`
                                : params.url;
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

            Array.from(onTokenChanges).forEach(onTokenChange => onTokenChange());
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
            autoLogoutCountdownTickCallbacks.add(tickCallback);

            const unsubscribeFromAutoLogoutCountdown = () => {
                autoLogoutCountdownTickCallbacks.delete(tickCallback);
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

            return Math.min(
                tokenExpirationTime - Date.now(),
                // NOTE: We want to make sure we do not overflow the setTimeout
                // that must be a 32 bit unsigned integer.
                // This can happen if the tokenExpirationTime is more than 24.8 days in the future.
                Math.pow(2, 31) - 1
            );
        };

        (function scheduleRenew() {
            // NOTE: We refresh the token 25 seconds before it expires.
            // If the token expiration time is less than 25 seconds we refresh the token when
            // only 1/10 of the token time is left.
            const renewMsBeforeExpires = Math.min(25_000, getMsBeforeExpiration() * 0.1);

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
                __unsafe_ssoSessionIdleSeconds !== undefined
                    ? Date.now() + __unsafe_ssoSessionIdleSeconds * 1000
                    : currentTokens.refreshTokenExpirationTime,
            "tickCallback": ({ secondsLeft }) => {
                Array.from(autoLogoutCountdownTickCallbacks).forEach(tickCallback =>
                    tickCallback({ secondsLeft })
                );

                if (secondsLeft === 0) {
                    oidc.logout(autoLogoutParams);
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
