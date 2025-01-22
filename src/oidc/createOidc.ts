import {
    UserManager as OidcClientTsUserManager,
    WebStorageStateStore,
    type User as OidcClientTsUser
} from "../vendor/frontend/oidc-client-ts-and-jwt-decode";
import { id, type Param0, assert, type Equals } from "../vendor/frontend/tsafe";
import { setTimeout, clearTimeout } from "../vendor/frontend/worker-timers";
import {
    addQueryParamToUrl,
    retrieveQueryParamFromUrl,
    retrieveAllQueryParamFromUrl,
    retrieveAllQueryParamStartingWithPrefixFromUrl
} from "../tools/urlQueryParams";
import { Deferred } from "../tools/Deferred";
import { decodeJwt } from "../tools/decodeJwt";
import { getDownlinkAndRtt } from "../tools/getDownlinkAndRtt";
import { createIsUserActive } from "../tools/createIsUserActive";
import { createStartCountdown } from "../tools/startCountdown";
import type { StatefulObservable } from "../tools/StatefulObservable";
import { toHumanReadableDuration } from "../tools/toHumanReadableDuration";
import { createHybridStorage } from "../tools/HybridStorage";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { OidcInitializationError } from "./OidcInitializationError";
import { getStateData, type StateData } from "./StateData";
import { notifyOtherTabOfLogout, getPrOtherTabLogout } from "./logoutPropagationToOtherTabs";
import { getConfigHash } from "./configHash";
import { maybeImpersonate } from "./imperativeImpersonation";
import { oidcClientTsUserToTokens } from "./oidcClientTsUserToTokens";
import type { Oidc } from "./Oidc";

// NOTE: Replaced at build time
const VERSION = "{{OIDC_SPA_VERSION}}";

export type ParamsOfCreateOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    IsAuthGloballyRequired extends boolean = false
> = {
    issuerUri: string;
    clientId: string;
    /**
     * The scopes being requested from the OIDC/OAuth2 provider (default: `["profile"]`
     * (the scope "openid" is added automatically as it's mandatory)
     **/
    scopes?: string[];
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
     * Extra body params to be added to the /token POST request.
     *
     * It will be used when for the initial request, whenever the token is getting refreshed and if you call `renewTokens()`.
     * You can also provide this parameter directly to the `renewTokens()` method.
     *
     * It can be either a string to string record or a function that returns a string to string record.
     *
     * Example: extraTokenParams: ()=> ({ selectedCustomer: "xxx" })
     *          extraTokenParams: { selectedCustomer: "xxx" }
     */
    extraTokenParams?: Record<string, string> | (() => Record<string, string>);
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
     * This parameter is used to let oidc-spa knows where is the home of your application.
     *
     * What should you put in this parameter?
     *   - Vite project:             `publicUrl: import.meta.env.BASE_URL`
     *   - Create React App project: `publicUrl: process.env.PUBLIC_URL`
     *   - Other:                    `publicUrl: "/"` (Usually, or `/my-app-name` if your app is not at the root of the domain)
     */
    BASE_URL: string | undefined;

    /**
     * This parameter is to provide if you don't have a dedicated oidc-callback.htm file.
     * If this parameter is provided, `BASE_URL` must be explicitly set to undefined.
     */
    homeUrl?: string;

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
    doEnableDebugLogs?: boolean;

    getDoContinueWithImpersonation?: (params: {
        parsedAccessToken: Record<string, unknown>;
    }) => Promise<boolean>;
};

const prOidcByConfigHash = new Map<string, Promise<Oidc<any>>>();

/** @see: https://docs.oidc-spa.dev/v/v5/documentation/usage */
export async function createOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    IsAuthGloballyRequired extends boolean = false
>(
    params: ParamsOfCreateOidc<DecodedIdToken, IsAuthGloballyRequired>
): Promise<IsAuthGloballyRequired extends true ? Oidc.LoggedIn<DecodedIdToken> : Oidc<DecodedIdToken>> {
    for (const name of ["issuerUri", "clientId"] as const) {
        const value = params[name];
        if (typeof value !== "string") {
            throw new Error(
                `The parameter "${name}" is required, you provided: ${value}. (Forgot a .env variable?)`
            );
        }
    }

    const { issuerUri, clientId, scopes = ["profile"], doEnableDebugLogs, ...rest } = params;

    const log = (() => {
        if (!doEnableDebugLogs) {
            return undefined;
        }

        return id<typeof console.log>((...[first, ...rest]) => {
            const label = "oidc-spa";

            if (typeof first === "string") {
                console.log(...[`${label}: ${first}`, ...rest]);
            } else {
                console.log(...[`${label}:`, first, ...rest]);
            }
        });
    })();

    const configHash = getConfigHash({ issuerUri, clientId });

    use_previous_instance: {
        const prOidc = prOidcByConfigHash.get(configHash);

        if (prOidc === undefined) {
            break use_previous_instance;
        }

        log?.(
            [
                `createOidc was called again with the same config (${JSON.stringify({
                    issuerUri,
                    clientId,
                    scopes
                })})`,
                `probably due to a hot module replacement. Returning the previous instance.`
            ].join(" ")
        );

        // @ts-expect-error: We know what we're doing
        return prOidc;
    }

    const dOidc = new Deferred<Oidc<any>>();

    prOidcByConfigHash.set(configHash, dOidc.pr);

    const oidc = await createOidc_nonMemoized(rest, {
        issuerUri,
        clientId,
        scopes,
        configHash,
        log
    });

    dOidc.resolve(oidc);

    return oidc;
}

let $isUserActive: StatefulObservable<boolean> | undefined = undefined;

const URL_real = window.URL;

export async function createOidc_nonMemoized<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    IsAuthGloballyRequired extends boolean = false
>(
    params: Omit<
        ParamsOfCreateOidc<DecodedIdToken, IsAuthGloballyRequired>,
        "issuerUri" | "clientId" | "scopes" | "doEnableDebugLogs"
    >,
    preProcessedParams: {
        issuerUri: string;
        clientId: string;
        scopes: string[];
        configHash: string;
        log: typeof console.log | undefined;
    }
): Promise<IsAuthGloballyRequired extends true ? Oidc.LoggedIn<DecodedIdToken> : Oidc<DecodedIdToken>> {
    const {
        transformUrlBeforeRedirect,
        extraQueryParams: extraQueryParamsOrGetter,
        extraTokenParams: extraTokenParamsOrGetter,
        BASE_URL: BASE_URL_params,
        homeUrl,
        decodedIdTokenSchema,
        __unsafe_ssoSessionIdleSeconds,
        autoLogoutParams = { "redirectTo": "current page" },
        isAuthGloballyRequired = false,
        postLoginRedirectUrl,
        getDoContinueWithImpersonation
    } = params;

    const { issuerUri, clientId, scopes, configHash, log } = preProcessedParams;

    const [getExtraQueryParams, getExtraTokenParams] = (
        [extraQueryParamsOrGetter, extraTokenParamsOrGetter] as const
    ).map(valueOrGetter => {
        if (typeof valueOrGetter === "function") {
            return valueOrGetter;
        }

        if (valueOrGetter !== undefined) {
            return () => valueOrGetter;
        }

        return undefined;
    });

    const urls = (() => {
        if (homeUrl !== undefined) {
            assert(
                BASE_URL_params === undefined,
                "If homeUrl is provided, BASE_URL must be explicitly set to undefined"
            );

            const url = toFullyQualifiedUrl(homeUrl);

            return {
                "hasDedicatedHtmFile": false,
                "callbackUrl": url,
                "homeUrl": url
            };
        } else {
            assert(
                BASE_URL_params !== undefined,
                "If homeUrl is not provided, BASE_URL must be provided"
            );

            const url = toFullyQualifiedUrl(BASE_URL_params);

            return {
                "hasDedicatedHtmFile": true,
                "callbackUrl": `${url}/oidc-callback.htm`,
                "homeUrl": url
            };
        }
    })();

    log?.(`Calling createOidc v${VERSION}`, { issuerUri, clientId, scopes, configHash, urls });

    oidc_callback_htm_polyfill: {
        const state = (() => {
            const result = retrieveQueryParamFromUrl({
                "url": window.location.href,
                "name": "state"
            });

            if (!result.wasPresent) {
                return undefined;
            }

            return result.value;
        })();

        if (state === undefined) {
            break oidc_callback_htm_polyfill;
        }

        const stateData = getStateData({ state });

        if (stateData === undefined) {
            break oidc_callback_htm_polyfill;
        }

        if (stateData.configHash !== configHash) {
            // Another oidc-spa instance should handle this
            await new Promise<never>(() => {});
        }

        if (urls.hasDedicatedHtmFile) {
            console.error(
                [
                    "You forgot to create the oidc-callback.htm file or the web server is not serving it correctly",
                    "suspending forever"
                ].join(" ")
            );
            // Here the user forget to create the silent-sso.htm file or or the web server is not serving it correctly
            // we shouldn't fall back to the SPA page.
            // In this case we want to let the timeout of the parent expire to provide the correct error message.
            await new Promise<never>(() => {});
        }

        const authResponse: Record<string, string> = {};

        for (const [key, value] of new URL(location.href).searchParams) {
            authResponse[key] = value;
        }

        if (stateData.isSilentSso) {
            parent.postMessage(authResponse, location.origin);
        } else {
            const redirectUrl = new URL(stateData.redirectUrl);

            for (const [key, value] of Object.entries(authResponse)) {
                redirectUrl.searchParams.set(`oidc-spa.${key}`, value);
            }

            location.replace(redirectUrl.href);
        }

        await new Promise<never>(() => {});
    }

    const store = createHybridStorage();

    imperative_impersonation: {
        if (getDoContinueWithImpersonation === undefined) {
            break imperative_impersonation;
        }

        await maybeImpersonate({
            configHash,
            getDoContinueWithImpersonation,
            store,
            log
        });
    }

    const oidcClientTsUserManager = new OidcClientTsUserManager({
        configHash,
        "authority": issuerUri,
        "client_id": clientId,
        "redirect_uri": urls.callbackUrl,
        "response_type": "code",
        "scope": Array.from(new Set(["openid", ...scopes])).join(" "),
        "automaticSilentRenew": false,
        "silent_redirect_uri": urls.callbackUrl,
        "userStore": new WebStorageStateStore({ store })
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

    type ParamsOfLoginOrGoToAuthServer = Omit<
        Param0<Oidc.NotLoggedIn["login"]>,
        "doesCurrentHrefRequiresAuth"
    > &
        ({ action: "login"; doesCurrentHrefRequiresAuth: boolean } | { action: "go to auth server" });

    const loginOrGoToAuthServer = async (params: ParamsOfLoginOrGoToAuthServer): Promise<never> => {
        const {
            extraQueryParams: extraQueryParams_fromLoginFn,
            redirectUrl: redirectUrl_params,
            transformUrlBeforeRedirect: transformUrlBeforeRedirect_fromLoginFn,
            ...rest
        } = params;

        log?.("Calling loginOrGoToAuthServer", { params });

        // NOTE: This is for handling cases when user press the back button on the login pages.
        // When the app is hosted on https (so not in dev mode) the browser will restore the state of the app
        // instead of reloading the page.
        if (rest.action === "login") {
            if (hasLoginBeenCalled) {
                log?.("login() has already been called, ignoring the call");
                return new Promise<never>(() => {});
            }

            hasLoginBeenCalled = true;

            const callback = () => {
                if (document.visibilityState === "visible") {
                    document.removeEventListener("visibilitychange", callback);

                    log?.(
                        "We came back from the login pages and the state of the app has been restored"
                    );

                    if (rest.doesCurrentHrefRequiresAuth) {
                        if (lastPublicRoute !== undefined) {
                            log?.(`Loading last public route: ${lastPublicRoute}`);
                            window.location.href = lastPublicRoute;
                        } else {
                            log?.("We don't know the last public route, navigating back in history");
                            window.history.back();
                        }
                    } else {
                        log?.("The current page doesn't require auth, we don't need to reload");
                        hasLoginBeenCalled = false;
                    }
                }
            };

            log?.("Start listening to visibility change event");

            document.addEventListener("visibilitychange", callback);
        }

        const redirectUrl =
            redirectUrl_params === undefined
                ? window.location.href
                : toFullyQualifiedUrl(redirectUrl_params);

        log?.(`redirectUrl: ${redirectUrl}`);

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
                            Object.defineProperty(window, "URL", { "value": URL_real });

                            let url = urlInstance.href;

                            (
                                [
                                    [getExtraQueryParams?.(), transformUrlBeforeRedirect],
                                    [
                                        extraQueryParams_fromLoginFn,
                                        transformUrlBeforeRedirect_fromLoginFn
                                    ]
                                ] as const
                            ).forEach(([extraQueryParams, transformUrlBeforeRedirect]) => {
                                add_extra_query_params: {
                                    if (extraQueryParams === undefined) {
                                        break add_extra_query_params;
                                    }

                                    Object.entries(extraQueryParams).forEach(
                                        ([name, value]) =>
                                            (url = addQueryParamToUrl({
                                                url,
                                                name,
                                                value
                                            }).newUrl)
                                    );
                                }

                                apply_transform_before_redirect: {
                                    if (transformUrlBeforeRedirect === undefined) {
                                        break apply_transform_before_redirect;
                                    }
                                    url = transformUrlBeforeRedirect(url);
                                }
                            });

                            return url;
                        }

                        //@ts-expect-error
                        return target[prop];
                    }
                });
            };

            Object.defineProperty(window, "URL", { "value": URL });
        }

        // NOTE: This is for the behavior when the use presses the back button on the login pages.
        // This is what happens when the user gave up the login process.
        // We want to that to redirect to the last public page.
        const redirectMethod = (() => {
            switch (rest.action) {
                case "login":
                    return rest.doesCurrentHrefRequiresAuth ? "replace" : "assign";
                case "go to auth server":
                    return "assign";
            }
        })();

        log?.(`redirectMethod: ${redirectMethod}`);

        const { extraQueryParams } = (() => {
            const extraQueryParams: Record<string, string> = extraQueryParams_fromLoginFn ?? {};

            read_query_params_added_by_transform_before_redirect: {
                if (transformUrlBeforeRedirect_fromLoginFn === undefined) {
                    break read_query_params_added_by_transform_before_redirect;
                }

                let url_afterTransform;

                try {
                    url_afterTransform = transformUrlBeforeRedirect_fromLoginFn("https://dummy.com");
                } catch {
                    break read_query_params_added_by_transform_before_redirect;
                }

                const { values: queryParamsAddedByTransformBeforeRedirect } =
                    retrieveAllQueryParamFromUrl({ "url": url_afterTransform });

                for (const [name, value] of Object.entries(queryParamsAddedByTransformBeforeRedirect)) {
                    extraQueryParams[name] = value;
                }
            }

            return { extraQueryParams };
        })();

        await oidcClientTsUserManager.signinRedirect({
            state: id<StateData>({
                configHash,
                "isSilentSso": false,
                redirectUrl,
                extraQueryParams
            }),
            redirectMethod
        });
        return new Promise<never>(() => {});
    };

    const resultOfLoginProcess = await (async () => {
        read_auth_response_from_url: {
            const { values: authResponse, newUrl: locationHref_cleanedUp } =
                retrieveAllQueryParamStartingWithPrefixFromUrl({
                    "url": window.location.href,
                    "prefix": "oidc-spa.",
                    "doLeavePrefixInResults": false
                });

            const state: string | undefined = authResponse["state"];

            if (state === undefined) {
                break read_auth_response_from_url;
            }

            const stateData = getStateData({ state });

            if (stateData === undefined) {
                break read_auth_response_from_url;
            }

            assert(!stateData.isSilentSso);

            if (stateData.configHash !== configHash) {
                break read_auth_response_from_url;
            }

            window.history.replaceState(null, "", locationHref_cleanedUp);

            log?.("Back from the auth server, with the following auth response", authResponse);

            {
                const error: string | undefined = authResponse["error"];

                if (error !== undefined) {
                    throw new Error(
                        [
                            "The OIDC server responded with an error after the login process",
                            `this error is: ${error}`
                        ].join(" ")
                    );
                }
            }

            const { authResponseUrl } = (() => {
                let authResponseUrl = "https://dummy.com";

                for (const [name, value] of Object.entries(authResponse)) {
                    authResponseUrl = addQueryParamToUrl({
                        "url": authResponseUrl,
                        name,
                        value
                    }).newUrl;
                }

                return { authResponseUrl };
            })();

            let oidcClientTsUser: OidcClientTsUser | undefined = undefined;

            try {
                oidcClientTsUser = await oidcClientTsUserManager.signinRedirectCallback(authResponseUrl);
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
                oidcClientTsUser,
                "backFromAuthServer": {
                    "extraQueryParams": stateData.extraQueryParams,
                    "result": Object.fromEntries(
                        Object.entries(authResponse).filter(
                            ([name]) =>
                                name !== "state" &&
                                name !== "session_state" &&
                                name !== "iss" &&
                                name !== "code"
                        )
                    )
                }
            };
        }

        // NOTE: oidc-spa do not persist the user token in the session storage.
        // So this block is not used EXCEPT for imperative impersonation.
        // We use a hybrid storage that persists only in this case.
        restore_session_from_session_storage: {
            let oidcClientTsUser = await oidcClientTsUserManager.getUser();

            if (oidcClientTsUser === null) {
                break restore_session_from_session_storage;
            }

            log?.("Restoring the user auth from the session storage");

            // Here the access token could be still valid but the session might have been invalidated
            // on the server. For example if the logout failed to redirect to the app.
            // We want to make sure that the session is still valid on the server side.
            try {
                oidcClientTsUser = await oidcClientTsUserManager.signinSilent({
                    "extraTokenParams": getExtraTokenParams?.()
                });
            } catch (error) {
                assert(error instanceof Error);

                log?.(`Session wasn't restorable: ${error.message}`);

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

                store.removeItem(`oidc.user:${issuerUri}:${clientId}`);

                return undefined;
            }

            assert(oidcClientTsUser !== null);

            log?.("Session successfully restored and access token refreshed");

            return {
                oidcClientTsUser,
                "backFromAuthServer": undefined
            };
        }

        restore_from_http_only_cookie: {
            log?.("Trying to restore the auth from the httpOnly cookie (silent signin with iframe)");

            type AuthResponse = {
                state: string;
                code: string;
                [key: string]: string;
            };

            const dAuthResponse = new Deferred<AuthResponse | undefined>();

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

                oidc_callback_htm_unreachable: {
                    if (!urls.hasDedicatedHtmFile) {
                        break oidc_callback_htm_unreachable;
                    }

                    const getHtmFileReachabilityStatus = async (ext?: "html") =>
                        fetch(`${urls.callbackUrl}${ext === "html" ? "l" : ""}`).then(
                            async response => {
                                dedicatedSilentSsoHtmlFileCsp =
                                    response.headers.get("Content-Security-Policy");

                                const content = await response.text();

                                return content.length < 1200 &&
                                    content.includes("parent.postMessage(authResponse")
                                    ? "ok"
                                    : "reachable but wrong content";
                            },
                            () => "not reachable" as const
                        );

                    const status = await getHtmFileReachabilityStatus();

                    if (status === "ok") {
                        break oidc_callback_htm_unreachable;
                    }

                    dAuthResponse.reject(
                        new OidcInitializationError({
                            "type": "bad configuration",
                            "likelyCause": {
                                "type": "oidc-callback.htm not properly served",
                                "oidcCallbackHtmUrl": urls.callbackUrl,
                                "likelyCause": await (async () => {
                                    if ((await getHtmFileReachabilityStatus("html")) === "ok") {
                                        return "using .html instead of .htm extension";
                                    }

                                    switch (status) {
                                        case "not reachable":
                                            return "the file hasn't been created";
                                        case "reachable but wrong content":
                                            return "serving another file";
                                    }
                                })()
                            }
                        })
                    );
                    return;
                }

                frame_ancestors_none: {
                    const csp = await (async () => {
                        if (urls.hasDedicatedHtmFile) {
                            assert(dedicatedSilentSsoHtmlFileCsp !== undefined);
                            return dedicatedSilentSsoHtmlFileCsp;
                        }

                        const csp = await fetch(urls.callbackUrl).then(
                            response => response.headers.get("Content-Security-Policy"),
                            error => id<Error>(error)
                        );

                        if (csp instanceof Error) {
                            dAuthResponse.reject(
                                new Error(`Failed to fetch ${urls.callbackUrl}: ${csp.message}`)
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

                    dAuthResponse.reject(
                        new OidcInitializationError({
                            "type": "bad configuration",
                            "likelyCause": {
                                "type": "frame-ancestors none",
                                urls
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
                dAuthResponse.reject(
                    new OidcInitializationError({
                        "type": "bad configuration",
                        "likelyCause": {
                            "type": "misconfigured OIDC client",
                            clientId,
                            timeoutDelayMs,
                            "callbackUrl": urls.callbackUrl
                        }
                    })
                );
            }, timeoutDelayMs);

            const listener = (event: MessageEvent) => {
                function getIsAuthResponse(data: any): data is AuthResponse {
                    return (
                        data instanceof Object &&
                        Object.values(data).every(value => typeof value === "string") &&
                        "state" in data &&
                        "code" in data
                    );
                }

                if (!getIsAuthResponse(event.data)) {
                    return;
                }

                const authResponse = event.data;

                const stateData = getStateData({ state: authResponse.state });

                if (stateData === undefined) {
                    return;
                }

                if (stateData.configHash !== configHash) {
                    return;
                }

                clearTimeout(timeout);

                window.removeEventListener("message", listener);

                {
                    const error: string | undefined = authResponse["error"];

                    if (error !== undefined) {
                        log?.(`The auth server responded with: ${error}`);
                        dAuthResponse.resolve(undefined);
                        return;
                    }
                }

                dAuthResponse.resolve(authResponse);
            };

            window.addEventListener("message", listener, false);

            oidcClientTsUserManager
                .signinSilent({
                    "silentRequestTimeoutInSeconds": timeoutDelayMs / 1000,
                    "extraTokenParams": getExtraTokenParams?.()
                })
                .catch((error: Error) => {
                    if (error.message === "Failed to fetch") {
                        clearTimeout(timeout);

                        // Here we know it's not web origin because it's not the token we are fetching
                        // but just the well known configuration endpoint that is not subject to CORS.
                        dAuthResponse.reject(
                            new OidcInitializationError({
                                "type": "server down",
                                issuerUri
                            })
                        );
                    }
                });

            const authResponse = await dAuthResponse.pr;

            if (authResponse === undefined) {
                log?.("There is no active session");
                break restore_from_http_only_cookie;
            }

            const { authResponseUrl } = (() => {
                let authResponseUrl = "https://dummy.com";

                for (const [name, value] of Object.entries(authResponse)) {
                    authResponseUrl = addQueryParamToUrl({
                        "url": authResponseUrl,
                        name,
                        value
                    }).newUrl;
                }

                return { authResponseUrl };
            })();

            let oidcClientTsUser: OidcClientTsUser | undefined = undefined;

            try {
                oidcClientTsUser = await oidcClientTsUserManager.signinRedirectCallback(authResponseUrl);
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

            log?.("Successful silent signed in");

            return {
                oidcClientTsUser,
                backFromAuthServer: undefined
            };
        }

        return undefined;
    })().then(
        result => {
            if (result === undefined) {
                return undefined;
            }

            const { oidcClientTsUser, backFromAuthServer } = result;

            log_real_decoded_id_token: {
                if (log === undefined) {
                    break log_real_decoded_id_token;
                }
                const idToken = oidcClientTsUser.id_token;

                if (idToken === undefined) {
                    break log_real_decoded_id_token;
                }

                const decodedIdToken = decodeJwt(idToken);

                log(
                    [
                        `Decoded ID token`,
                        decodedIdTokenSchema === undefined
                            ? ""
                            : " before `decodedIdTokenSchema.parse()`\n",
                        JSON.stringify(decodedIdToken, null, 2)
                    ].join("")
                );

                if (decodedIdTokenSchema === undefined) {
                    break log_real_decoded_id_token;
                }

                log(
                    [
                        "Decoded ID token after `decodedIdTokenSchema.parse()`\n",
                        JSON.stringify(decodedIdTokenSchema.parse(decodedIdToken), null, 2)
                    ].join("")
                );
            }

            const tokens = oidcClientTsUserToTokens({
                oidcClientTsUser,
                decodedIdTokenSchema,
                log
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

            return { tokens, backFromAuthServer };
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
        log?.("User not logged in and there was an initialization error");

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
        log?.("User not logged in");

        if (isAuthGloballyRequired) {
            log?.("Authentication is required everywhere on this app, redirecting to the login page");
            await loginOrGoToAuthServer({
                "action": "login",
                "doesCurrentHrefRequiresAuth": true,
                "redirectUrl": postLoginRedirectUrl
            });
            // Never here
        }

        startTrackingLastPublicRoute();

        const oidc = id<Oidc.NotLoggedIn>({
            ...common,
            "isUserLoggedIn": false,
            "login": params => loginOrGoToAuthServer({ "action": "login", ...params }),
            "initializationError": undefined
        });

        // @ts-expect-error: We know what we are doing.
        return oidc;
    }

    log?.("User is logged in");

    let currentTokens = resultOfLoginProcess.tokens;

    const autoLogoutCountdownTickCallbacks = new Set<
        (params: { secondsLeft: number | undefined }) => void
    >();

    const onTokenChanges = new Set<() => void>();

    let hasLogoutBeenCalled = false;

    const oidc = id<Oidc.LoggedIn<DecodedIdToken>>({
        ...common,
        "isUserLoggedIn": true,
        "getTokens": () => currentTokens,
        "logout": async params => {
            if (hasLogoutBeenCalled) {
                log?.("logout() has already been called, ignoring the call");
                return new Promise<never>(() => {});
            }

            hasLogoutBeenCalled = true;

            notifyOtherTabOfLogout({
                configHash,
                logoutParams: params
            });

            await oidcClientTsUserManager.signoutRedirect({
                "post_logout_redirect_uri": ((): string => {
                    switch (params.redirectTo) {
                        case "current page":
                            return window.location.href;
                        case "home":
                            if (publicUrl === undefined) {
                                throw new Error(
                                    [
                                        "Since you've opted out of the `silent-sso.htm` file you are probably in a",
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
        "renewTokens": async params => {
            const { extraTokenParams: extraTokenParams_local } = params ?? {};

            const oidcClientTsUser = await oidcClientTsUserManager.signinSilent({
                "extraTokenParams": {
                    ...getExtraTokenParams?.(),
                    ...extraTokenParams_local
                }
            });

            assert(oidcClientTsUser !== null);

            const decodedIdTokenPropertyDescriptor = Object.getOwnPropertyDescriptor(
                currentTokens,
                "decodedIdToken"
            );

            assert(decodedIdTokenPropertyDescriptor !== undefined);

            currentTokens = oidcClientTsUserToTokens({
                oidcClientTsUser,
                decodedIdTokenSchema,
                log
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
        //"loginScenario": resultOfLoginProcess.loginScenario,
        "goToAuthServer": params => loginOrGoToAuthServer({ "action": "go to auth server", ...params }),
        "backFromAuthServer": resultOfLoginProcess.backFromAuthServer,
        "isNewBrowserSession": (() => {
            const key = `oidc-spa:browser-session:${configHash}`;

            if (store.getItem(key) === null) {
                store.setItem(key, "true");

                log?.("This is a new browser session");

                return true;
            }

            log?.("This is not a new browser session");

            return false;
        })()
    });

    {
        const { prOtherTabLogout } = getPrOtherTabLogout({ configHash });

        prOtherTabLogout.then(logoutParams => oidc.logout(logoutParams));
    }

    {
        const getMsBeforeExpiration = () => {
            // NOTE: In general the access token is supposed to have a shorter
            // lifespan than the refresh token but we don't want to make any
            // assumption here.
            const tokenExpirationTime = Math.min(
                currentTokens.accessTokenExpirationTime,
                currentTokens.refreshTokenExpirationTime
            );

            const msBeforeExpiration = Math.min(
                tokenExpirationTime - Date.now(),
                // NOTE: We want to make sure we do not overflow the setTimeout
                // that must be a 32 bit unsigned integer.
                // This can happen if the tokenExpirationTime is more than 24.8 days in the future.
                Math.pow(2, 31) - 1
            );

            if (msBeforeExpiration < 0) {
                log?.("Token has already expired");
                return 0;
            }

            return msBeforeExpiration;
        };

        (function scheduleRenew() {
            const msBeforeExpiration = getMsBeforeExpiration();

            // NOTE: We refresh the token 25 seconds before it expires.
            // If the token expiration time is less than 25 seconds we refresh the token when
            // only 1/10 of the token time is left.
            const renewMsBeforeExpires = Math.min(25_000, msBeforeExpiration * 0.1);

            log?.(
                [
                    toHumanReadableDuration(msBeforeExpiration),
                    `before expiration of the access token.`,
                    `Scheduling renewal ${toHumanReadableDuration(
                        renewMsBeforeExpires
                    )} before expiration`
                ].join(" ")
            );

            const timer = setTimeout(async () => {
                log?.(
                    `Renewing the access token now as it will expires in ${toHumanReadableDuration(
                        renewMsBeforeExpires
                    )}`
                );

                try {
                    await oidc.renewTokens();
                } catch {
                    // NOTE: Here semantically `"doesCurrentHrefRequiresAuth": false` is wrong.
                    // The user may very well be on a page that require auth.
                    // However there's no way to enforce the browser to redirect back to
                    // the last public route if the user press back on the login page.
                    // This is due to the fact that pushing to history only works if it's
                    // triggered by a user interaction.
                    await loginOrGoToAuthServer({
                        "action": "login",
                        "doesCurrentHrefRequiresAuth": false
                    });
                }
            }, msBeforeExpiration - renewMsBeforeExpires);

            const { unsubscribe: tokenChangeUnsubscribe } = oidc.subscribeToTokensChange(() => {
                clearTimeout(timer);
                tokenChangeUnsubscribe();
                scheduleRenew();
            });
        })();
    }

    {
        const { startCountdown } = createStartCountdown({
            "getCountdownEndTime": (() => {
                const getCountdownEndTime = () =>
                    __unsafe_ssoSessionIdleSeconds !== undefined
                        ? Date.now() + __unsafe_ssoSessionIdleSeconds * 1000
                        : currentTokens.refreshTokenExpirationTime;

                const durationBeforeAutoLogout = toHumanReadableDuration(
                    getCountdownEndTime() - Date.now()
                );

                log?.(
                    [
                        `The user will be automatically logged out after ${durationBeforeAutoLogout} of inactivity.`,
                        __unsafe_ssoSessionIdleSeconds === undefined
                            ? undefined
                            : `It was artificially defined by using the __unsafe_ssoSessionIdleSeconds param.`
                    ]
                        .filter(x => x !== undefined)
                        .join("\n")
                );

                return getCountdownEndTime;
            })(),
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

        $isUserActive.subscribe(isUserActive => {
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
    }

    return oidc;
}
