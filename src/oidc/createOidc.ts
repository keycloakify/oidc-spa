import {
    UserManager as OidcClientTsUserManager,
    WebStorageStateStore,
    type User as OidcClientTsUser,
    InMemoryWebStorage
} from "../vendor/frontend/oidc-client-ts-and-jwt-decode";
import { id, type Param0, assert, is, type Equals, typeGuard } from "../vendor/frontend/tsafe";
import { setTimeout, clearTimeout } from "../tools/workerTimers";
import { Deferred } from "../tools/Deferred";
import { decodeJwt } from "../tools/decodeJwt";
import { create$isUserActive } from "./createIsUserActive";
import { createStartCountdown } from "../tools/startCountdown";
import type { StatefulObservable } from "../tools/StatefulObservable";
import { toHumanReadableDuration } from "../tools/toHumanReadableDuration";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import {
    OidcInitializationError,
    createFailedToFetchTokenEndpointInitializationError,
    createIframeTimeoutInitializationError,
    createWellKnownOidcConfigurationEndpointUnreachableInitializationError
} from "./OidcInitializationError";
import {
    getStateData,
    type StateData,
    generateStateQueryParamValue,
    STATE_STORE_KEY_PREFIX
} from "./StateData";
import { notifyOtherTabsOfLogout, getPrOtherTabLogout } from "./logoutPropagationToOtherTabs";
import { getConfigId } from "./configId";
import { oidcClientTsUserToTokens } from "./oidcClientTsUserToTokens";
import { loginSilent, authResponseToUrl } from "./loginSilent";
import { handleOidcCallback, AUTH_RESPONSE_KEY } from "./handleOidcCallback";
import {
    clearPersistedLogoutState,
    getIsPersistedLogoutState,
    persistLogoutState
} from "./persistedLogoutState";
import type { Oidc } from "./Oidc";
import { type AwaitableEventEmitter, createAwaitableEventEmitter } from "../tools/AwaitableEventEmitter";

// NOTE: Replaced at build time
const VERSION = "{{OIDC_SPA_VERSION}}";

export type ParamsOfCreateOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    AutoLogin extends boolean = false
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
     * What should you put in this parameter?
     *   - Vite project:             `BASE_URL: import.meta.env.BASE_URL`
     *   - Create React App project: `BASE_URL: process.env.PUBLIC_URL`
     *   - Other:                    `BASE_URL: "/"` (Usually, or `/dashboard` if your app is not at the root of the domain)
     */
    homeUrl: string;

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
    autoLogin?: AutoLogin;
    debugLogs?: boolean;

    __clientSecret?: string;

    /**
     *  WARNING: Setting this to true is a workaround for provider
     *  like Google OAuth that don't support JWT access token.
     *  Use at your own risk, this is a hack.
     */
    __substituteAccessTokenByIdToken?: boolean;
};

handleOidcCallback();

const GLOBAL_CONTEXT_KEY = "__oidc-spa.createOidc.globalContext";

declare global {
    interface Window {
        [GLOBAL_CONTEXT_KEY]: {
            prOidcByConfigId: Map<string, Promise<Oidc<any>>>;
            evtAuthResponseHandled: AwaitableEventEmitter<void>;
            URL_real: typeof URL;
            $isUserActive: StatefulObservable<boolean> | undefined;
            hasLoginBeenCalled: boolean;
            hasLogoutBeenCalled: boolean;
        };
    }
}

window[GLOBAL_CONTEXT_KEY] ??= {
    prOidcByConfigId: new Map(),
    evtAuthResponseHandled: createAwaitableEventEmitter<void>(),
    URL_real: window.URL,
    $isUserActive: undefined,
    hasLoginBeenCalled: false,
    hasLogoutBeenCalled: false
};

const globalContext = window[GLOBAL_CONTEXT_KEY];

/** @see: https://docs.oidc-spa.dev/v/v6/usage */
export async function createOidc<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    AutoLogin extends boolean = false
>(
    params: ParamsOfCreateOidc<DecodedIdToken, AutoLogin>
): Promise<AutoLogin extends true ? Oidc.LoggedIn<DecodedIdToken> : Oidc<DecodedIdToken>> {
    for (const name of ["issuerUri", "clientId"] as const) {
        const value = params[name];
        if (!value) {
            throw new Error(
                `The parameter "${name}" is required, you provided: ${value}. (Forgot a .env variable?)`
            );
        }
    }

    const { issuerUri: issuerUri_params, clientId, scopes = ["profile"], debugLogs, ...rest } = params;

    const issuerUri = toFullyQualifiedUrl({
        urlish: issuerUri_params,
        doAssertNoQueryParams: true,
        doOutputWithTrailingSlash: false
    });

    const log = (() => {
        if (!debugLogs) {
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

    const configId = getConfigId({ issuerUri, clientId });

    const { prOidcByConfigId } = globalContext;

    use_previous_instance: {
        const prOidc = prOidcByConfigId.get(configId);

        if (prOidc === undefined) {
            break use_previous_instance;
        }

        log?.(
            [
                `createOidc was called again with the same config (${JSON.stringify({
                    issuerUri,
                    clientId
                })})`,
                `Returning the previous instance. All potential different parameters are ignored.`
            ].join(" ")
        );

        // @ts-expect-error: We know what we're doing
        return prOidc;
    }

    const dOidc = new Deferred<Oidc<any>>();

    prOidcByConfigId.set(configId, dOidc.pr);

    const oidc = await createOidc_nonMemoized(rest, {
        issuerUri,
        clientId,
        scopes,
        configId,
        log
    });

    dOidc.resolve(oidc);

    return oidc;
}

export async function createOidc_nonMemoized<
    DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
    AutoLogin extends boolean = false
>(
    params: Omit<
        ParamsOfCreateOidc<DecodedIdToken, AutoLogin>,
        "issuerUri" | "clientId" | "scopes" | "debugLogs"
    >,
    preProcessedParams: {
        issuerUri: string;
        clientId: string;
        scopes: string[];
        configId: string;
        log: typeof console.log | undefined;
    }
): Promise<AutoLogin extends true ? Oidc.LoggedIn<DecodedIdToken> : Oidc<DecodedIdToken>> {
    const {
        transformUrlBeforeRedirect,
        extraQueryParams: extraQueryParamsOrGetter,
        extraTokenParams: extraTokenParamsOrGetter,
        homeUrl: homeUrl_params,
        decodedIdTokenSchema,
        __unsafe_ssoSessionIdleSeconds,
        autoLogoutParams = { redirectTo: "current page" },
        autoLogin = false,
        postLoginRedirectUrl,
        __clientSecret,
        __substituteAccessTokenByIdToken = false
    } = params;

    const { issuerUri, clientId, scopes, configId, log } = preProcessedParams;

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

    const homeAndCallbackUrl = toFullyQualifiedUrl({
        urlish: homeUrl_params,
        doAssertNoQueryParams: true,
        doOutputWithTrailingSlash: true
    });

    log?.(`Calling createOidc v${VERSION}`, {
        issuerUri,
        clientId,
        scopes,
        configId,
        homeAndCallbackUrl
    });

    {
        const { isHandled } = handleOidcCallback();

        if (isHandled) {
            await new Promise<never>(() => {});
        }
    }

    const USER_LOGGED_IN_KEY = `oidc-spa.user-logged-in:${configId}`;

    localStorage.removeItem(USER_LOGGED_IN_KEY);

    const stateQueryParamValue_instance = generateStateQueryParamValue();

    const oidcClientTsUserManager = new OidcClientTsUserManager({
        stateQueryParamValue: stateQueryParamValue_instance,
        authority: issuerUri,
        client_id: clientId,
        redirect_uri: homeAndCallbackUrl,
        silent_redirect_uri: homeAndCallbackUrl,
        post_logout_redirect_uri: homeAndCallbackUrl,
        response_type: "code",
        scope: Array.from(new Set(["openid", ...scopes])).join(" "),
        automaticSilentRenew: false,
        userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
        stateStore: new WebStorageStateStore({ store: localStorage, prefix: STATE_STORE_KEY_PREFIX }),
        client_secret: __clientSecret
    });

    let lastPublicUrl: string | undefined = undefined;

    // NOTE: To call only if not logged in.
    const startTrackingLastPublicUrl = () => {
        const realPushState = history.pushState.bind(history);
        history.pushState = function pushState(...args) {
            lastPublicUrl = window.location.href;
            return realPushState(...args);
        };
    };

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
            if (globalContext.hasLoginBeenCalled) {
                log?.("login() has already been called, ignoring the call");
                return new Promise<never>(() => {});
            }

            globalContext.hasLoginBeenCalled = true;

            const callback = () => {
                if (document.visibilityState === "visible") {
                    document.removeEventListener("visibilitychange", callback);

                    log?.(
                        "We came back from the login pages and the state of the app has been restored"
                    );

                    if (rest.doesCurrentHrefRequiresAuth) {
                        if (lastPublicUrl !== undefined) {
                            log?.(`Loading last public route: ${lastPublicUrl}`);
                            window.location.href = lastPublicUrl;
                        } else {
                            log?.("We don't know the last public route, navigating back in history");
                            window.history.back();
                        }
                    } else {
                        log?.("The current page doesn't require auth...");

                        if (localStorage.getItem(USER_LOGGED_IN_KEY)) {
                            log?.("but the user is now authenticated, reloading the page");
                            location.reload();
                        } else {
                            log?.("and the user doesn't seem to be authenticated, avoiding a reload");
                            globalContext.hasLoginBeenCalled = false;
                        }
                    }
                }
            };

            log?.("Start listening to visibility change event");

            document.addEventListener("visibilitychange", callback);
        }

        const redirectUrl =
            redirectUrl_params === undefined
                ? window.location.href
                : toFullyQualifiedUrl({
                      urlish: redirectUrl_params,
                      doAssertNoQueryParams: false
                  });

        log?.(`redirectUrl: ${redirectUrl}`);

        //NOTE: We know there is a extraQueryParameter option but it doesn't allow
        // to control the encoding so we have to highjack global URL Class that is
        // used internally by oidc-client-ts. It's save to do so since this is the
        // last thing that will be done before the redirect.
        {
            const { URL_real } = globalContext;

            const URL = (...args: ConstructorParameters<typeof URL_real>) => {
                const urlInstance = new URL_real(...args);

                return new Proxy(urlInstance, {
                    get: (target, prop) => {
                        if (prop === "href") {
                            Object.defineProperty(window, "URL", { value: URL_real });

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

                                    const url_obj = new URL_real(url);

                                    for (const [name, value] of Object.entries(extraQueryParams)) {
                                        url_obj.searchParams.set(name, value);
                                    }

                                    url = url_obj.href;
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

            Object.defineProperty(window, "URL", { value: URL });
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

                for (const [name, value] of new URL(url_afterTransform).searchParams) {
                    extraQueryParams[name] = value;
                }
            }

            return { extraQueryParams };
        })();

        await oidcClientTsUserManager.signinRedirect({
            state: id<StateData>({
                context: "redirect",
                redirectUrl,
                extraQueryParams,
                hasBeenProcessedByCallback: false,
                configId,
                action: "login",
                redirectUrl_consentRequiredCase: (() => {
                    switch (rest.action) {
                        case "login":
                            return lastPublicUrl ?? homeAndCallbackUrl;
                        case "go to auth server":
                            return redirectUrl;
                    }
                })()
            }),
            redirectMethod,
            prompt: getIsPersistedLogoutState({ configId }) ? "consent" : undefined
        });
        return new Promise<never>(() => {});
    };

    const BROWSER_SESSION_NOT_FIRST_INIT_KEY = `oidc-spa.browser-session-not-first-init:${configId}`;

    const resultOfLoginProcess = await (async (): Promise<
        | undefined // User is currently not logged in
        | Error // Initialization error
        | {
              oidcClientTsUser: OidcClientTsUser;
              backFromAuthServer: Oidc.LoggedIn["backFromAuthServer"]; // Undefined is silent signin
          }
    > => {
        handle_redirect_auth_response: {
            const authResponse = (() => {
                const value = sessionStorage.getItem(AUTH_RESPONSE_KEY);

                if (value === null) {
                    return undefined;
                }

                let authResponse: unknown;

                try {
                    authResponse = JSON.parse(value);

                    assert(
                        typeGuard<{ state: string; [key: string]: string }>(
                            authResponse,
                            authResponse instanceof Object &&
                                Object.values(authResponse).every(value => typeof value === "string")
                        ),
                        "Valid json but not expected shape"
                    );
                } catch (error) {
                    console.error(`Failed to parse auth response from callback URL ${String(error)}`);
                    return undefined;
                }

                return authResponse;
            })();

            if (authResponse === undefined) {
                break handle_redirect_auth_response;
            }

            const stateData = getStateData({ stateQueryParamValue: authResponse["state"] });

            assert(stateData !== undefined);
            assert(stateData.context === "redirect");

            const { evtAuthResponseHandled } = globalContext;

            if (stateData.configId !== configId) {
                // NOTE: Best attempt at letting the other client handle the request synchronously
                // but we won't wait for it because the initialization of the other client might
                // be contingent on the initialization of this client.
                const prHandled = evtAuthResponseHandled.waitFor();
                await Promise.resolve();
                if (sessionStorage.getItem(AUTH_RESPONSE_KEY) === null) {
                    await prHandled;
                }
                break handle_redirect_auth_response;
            }

            sessionStorage.removeItem(AUTH_RESPONSE_KEY);

            switch (stateData.action) {
                case "login":
                    {
                        log?.("Handling login redirect auth response", authResponse);

                        const authResponseUrl = authResponseToUrl(authResponse);

                        let oidcClientTsUser: OidcClientTsUser | undefined = undefined;

                        try {
                            oidcClientTsUser = await oidcClientTsUserManager
                                .signinRedirectCallback(authResponseUrl)
                                .finally(() => {
                                    evtAuthResponseHandled.post();
                                });
                        } catch (error) {
                            assert(error instanceof Error);

                            if (error.message === "Failed to fetch") {
                                return createFailedToFetchTokenEndpointInitializationError({
                                    clientId,
                                    issuerUri
                                });
                            }

                            {
                                const error: string | undefined = authResponse["error"];

                                if (error !== undefined) {
                                    log?.(
                                        `The auth server responded with: ${error}, trying to restore from the http only cookie`
                                    );
                                    break handle_redirect_auth_response;
                                }
                            }

                            return error;
                        }

                        sessionStorage.removeItem(BROWSER_SESSION_NOT_FIRST_INIT_KEY);
                        clearPersistedLogoutState({ configId });

                        return {
                            oidcClientTsUser,
                            backFromAuthServer: {
                                extraQueryParams: stateData.extraQueryParams,
                                result: Object.fromEntries(
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
                    break;
                case "logout":
                    {
                        log?.("Handling logout redirect auth response", authResponse);

                        const authResponseUrl = authResponseToUrl(authResponse);

                        try {
                            await oidcClientTsUserManager.signoutRedirectCallback(authResponseUrl);
                        } catch {}

                        evtAuthResponseHandled.post();

                        notifyOtherTabsOfLogout({
                            configId,
                            redirectUrl: stateData.redirectUrl,
                            sessionId: stateData.sessionId
                        });

                        // NOTE: The user is no longer logged in.
                        return undefined;
                    }
                    break;
            }
        }

        restore_from_http_only_cookie: {
            log?.("Trying to restore the auth from the http only cookie (silent signin with iframe)");

            if (getIsPersistedLogoutState({ configId })) {
                log?.("Skipping silent signin with iframe, the user has logged out");
                break restore_from_http_only_cookie;
            }

            const result_loginSilent = await loginSilent({
                oidcClientTsUserManager,
                stateQueryParamValue_instance,
                configId,
                getExtraTokenParams
            });

            assert(result_loginSilent.outcome !== "refresh token used");

            if (result_loginSilent.outcome === "failure") {
                switch (result_loginSilent.cause) {
                    case "can't reach well-known oidc endpoint":
                        return createWellKnownOidcConfigurationEndpointUnreachableInitializationError({
                            issuerUri
                        });
                    case "timeout":
                        return createIframeTimeoutInitializationError({
                            homeAndCallbackUrl,
                            clientId,
                            issuerUri
                        });
                }

                assert<Equals<typeof result_loginSilent.cause, never>>(false);
            }

            assert<Equals<typeof result_loginSilent.outcome, "success iframe">>();

            const { authResponse } = result_loginSilent;

            log?.("Silent signin auth response", authResponse);

            let oidcClientTsUser: OidcClientTsUser | undefined = undefined;

            try {
                oidcClientTsUser = await oidcClientTsUserManager.signinRedirectCallback(
                    authResponseToUrl(authResponse)
                );
            } catch (error) {
                assert(error instanceof Error);

                if (error.message === "Failed to fetch") {
                    return createFailedToFetchTokenEndpointInitializationError({
                        clientId,
                        issuerUri
                    });
                }

                {
                    const error: string | undefined = authResponse["error"];

                    if (error !== undefined) {
                        // NOTE: This is a very expected case, it happens each time there's no active session.
                        log?.(
                            [
                                `The auth server responded with: ${error} `,
                                "login_required" === error
                                    ? `(authentication_required just means that there's no active session for the user)`
                                    : ""
                            ].join("")
                        );
                        break restore_from_http_only_cookie;
                    }
                }

                return error;
            }

            log?.("Successful silent signed in");

            return {
                oidcClientTsUser,
                backFromAuthServer: undefined
            };
        }

        // NOTE: The user is not logged in.
        return undefined;
    })().then(result => {
        if (result === undefined) {
            return undefined;
        }

        if (result instanceof Error) {
            return result;
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
                    decodedIdTokenSchema === undefined ? "" : " before `decodedIdTokenSchema.parse()`\n",
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
            __substituteAccessTokenByIdToken,
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
    });

    const common: Oidc.Common = {
        params: {
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
                      isAuthServerLikelyDown: false,
                      messageOrCause: error
                  });

        if (autoLogin) {
            throw initializationError;
        }

        console.error(
            [
                `oidc-spa Initialization Error: `,
                `isAuthServerLikelyDown: ${initializationError.isAuthServerLikelyDown}`,
                ``,
                initializationError.message
            ].join("\n")
        );

        startTrackingLastPublicUrl();

        const oidc = id<Oidc.NotLoggedIn>({
            ...common,
            isUserLoggedIn: false,
            login: async () => {
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

        if (autoLogin) {
            log?.("Authentication is required everywhere on this app, redirecting to the login page");
            await loginOrGoToAuthServer({
                action: "login",
                doesCurrentHrefRequiresAuth: true,
                redirectUrl: postLoginRedirectUrl
            });
            // Never here
        }

        startTrackingLastPublicUrl();

        const oidc = id<Oidc.NotLoggedIn>({
            ...common,
            isUserLoggedIn: false,
            login: params => loginOrGoToAuthServer({ action: "login", ...params }),
            initializationError: undefined
        });

        // @ts-expect-error: We know what we are doing.
        return oidc;
    }

    log?.("User is logged in");

    localStorage.setItem(USER_LOGGED_IN_KEY, "true");

    let currentTokens = resultOfLoginProcess.tokens;

    function getMsBeforeExpiration() {
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
    }

    const autoLogoutCountdownTickCallbacks = new Set<
        (params: { secondsLeft: number | undefined }) => void
    >();

    const onTokenChanges = new Set<() => void>();

    const oidc = id<Oidc.LoggedIn<DecodedIdToken>>({
        ...common,
        isUserLoggedIn: true,
        getTokens: () => currentTokens,
        getTokens_next: async () => {
            if (getMsBeforeExpiration() <= 5_000) {
                await oidc.renewTokens();
            }

            return currentTokens;
        },
        logout: async params => {
            if (globalContext.hasLogoutBeenCalled) {
                log?.("logout() has already been called, ignoring the call");
                return new Promise<never>(() => {});
            }

            globalContext.hasLogoutBeenCalled = true;

            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") {
                    location.reload();
                }
            });

            const postLogoutRedirectUrl: string = (() => {
                switch (params.redirectTo) {
                    case "current page":
                        return window.location.href;
                    case "home":
                        return homeAndCallbackUrl;
                    case "specific url":
                        return toFullyQualifiedUrl({
                            urlish: params.url,
                            doAssertNoQueryParams: false
                        });
                }
            })();

            try {
                await oidcClientTsUserManager.signoutRedirect({
                    state: id<StateData>({
                        configId,
                        context: "redirect",
                        redirectUrl: postLogoutRedirectUrl,
                        hasBeenProcessedByCallback: false,
                        action: "logout",
                        sessionId
                    }),
                    redirectMethod: "assign"
                });
            } catch (error) {
                assert(is<Error>(error));

                if (error.message !== "No end session endpoint") {
                    throw error;
                }

                log?.("No end session endpoint, managing logging state locally");

                persistLogoutState({ configId });
                window.location.href = postLogoutRedirectUrl;
            }

            return new Promise<never>(() => {});
        },
        renewTokens: (() => {
            async function renewTokens_nonMutexed(params: { extraTokenParams: Record<string, string> }) {
                const { extraTokenParams } = params;

                log?.("Renewing tokens");

                const result_loginSilent = await loginSilent({
                    oidcClientTsUserManager,
                    stateQueryParamValue_instance,
                    configId,
                    getExtraTokenParams: () => extraTokenParams
                });

                if (result_loginSilent.outcome === "failure") {
                    throw new Error(result_loginSilent.cause);
                }

                let oidcClientTsUser: OidcClientTsUser;

                switch (result_loginSilent.outcome) {
                    case "refresh token used":
                        {
                            log?.("Refresh token used");
                            oidcClientTsUser = result_loginSilent.oidcClientTsUser;
                        }
                        break;
                    case "success iframe":
                        {
                            const { authResponse } = result_loginSilent;

                            log?.("Tokens refresh using iframe", authResponse);

                            oidcClientTsUser = await oidcClientTsUserManager.signinRedirectCallback(
                                authResponseToUrl(authResponse)
                            );
                        }
                        break;
                    default:
                        assert<Equals<typeof result_loginSilent, never>>(false);
                        break;
                }

                const decodedIdToken_before = currentTokens.decodedIdToken;

                currentTokens = oidcClientTsUserToTokens({
                    oidcClientTsUser,
                    decodedIdTokenSchema,
                    __substituteAccessTokenByIdToken,
                    log
                });

                if (
                    JSON.stringify(currentTokens.decodedIdToken) ===
                    JSON.stringify(decodedIdToken_before)
                ) {
                    id<{ decodedIdToken: DecodedIdToken }>(currentTokens).decodedIdToken =
                        decodedIdToken_before;
                }

                Array.from(onTokenChanges).forEach(onTokenChange => onTokenChange());
            }

            let ongoingCall:
                | {
                      pr: Promise<void>;
                      extraTokenParams: Record<string, string>;
                  }
                | undefined = undefined;

            function handleFinally() {
                assert(ongoingCall !== undefined);

                const { pr } = ongoingCall;

                pr.finally(() => {
                    assert(ongoingCall !== undefined);

                    if (ongoingCall.pr !== pr) {
                        return;
                    }

                    ongoingCall = undefined;
                });
            }

            return async params => {
                const { extraTokenParams: extraTokenParams_local } = params ?? {};

                const extraTokenParams = {
                    ...getExtraTokenParams?.(),
                    ...extraTokenParams_local
                };

                if (ongoingCall === undefined) {
                    ongoingCall = {
                        pr: renewTokens_nonMutexed({ extraTokenParams }),
                        extraTokenParams
                    };

                    handleFinally();

                    return ongoingCall.pr;
                }

                if (JSON.stringify(extraTokenParams) === JSON.stringify(ongoingCall.extraTokenParams)) {
                    return ongoingCall.pr;
                }

                ongoingCall = {
                    pr: (async () => {
                        try {
                            await ongoingCall.pr;
                        } catch {}

                        return renewTokens_nonMutexed({ extraTokenParams });
                    })(),
                    extraTokenParams
                };

                handleFinally();

                return ongoingCall.pr;
            };
        })(),
        subscribeToTokensChange: onTokenChange => {
            onTokenChanges.add(onTokenChange);

            return {
                unsubscribe: () => {
                    onTokenChanges.delete(onTokenChange);
                }
            };
        },
        subscribeToAutoLogoutCountdown: tickCallback => {
            autoLogoutCountdownTickCallbacks.add(tickCallback);

            const unsubscribeFromAutoLogoutCountdown = () => {
                autoLogoutCountdownTickCallbacks.delete(tickCallback);
            };

            return { unsubscribeFromAutoLogoutCountdown };
        },
        goToAuthServer: params => loginOrGoToAuthServer({ action: "go to auth server", ...params }),
        backFromAuthServer: resultOfLoginProcess.backFromAuthServer,
        isNewBrowserSession: (() => {
            if (sessionStorage.getItem(BROWSER_SESSION_NOT_FIRST_INIT_KEY) === null) {
                sessionStorage.setItem(BROWSER_SESSION_NOT_FIRST_INIT_KEY, "true");

                log?.("This is a new browser session");

                return true;
            }

            log?.("This is not a new browser session");

            return false;
        })()
    });

    const sessionId = decodeJwt<{ sid?: string }>(currentTokens.idToken).sid;

    {
        const { prOtherTabLogout } = getPrOtherTabLogout({
            configId,
            homeUrl: homeAndCallbackUrl,
            sessionId
        });

        prOtherTabLogout.then(({ redirectUrl }) => {
            log?.(`Other tab has logged out, redirecting to ${redirectUrl}`);
            window.location.href = redirectUrl;
        });
    }

    (function scheduleRenew() {
        const msBeforeExpiration = getMsBeforeExpiration();

        // NOTE: Here semantically `"doesCurrentHrefRequiresAuth": false` is wrong.
        // The user may very well be on a page that require auth.
        // However there's no way to enforce the browser to redirect back to
        // the last public route if the user press back on the login page.
        // This is due to the fact that pushing to history only works if it's
        // triggered by a user interaction.
        const login_dueToExpiration = () =>
            loginOrGoToAuthServer({
                action: "login",
                doesCurrentHrefRequiresAuth: false
            });

        if (msBeforeExpiration <= 2_000) {
            // NOTE: We just got a new token that is about to expire. This means that
            // the refresh token has reached it's max SSO time.
            login_dueToExpiration();
            return;
        }

        // NOTE: We refresh the token 25 seconds before it expires.
        // If the token expiration time is less than 25 seconds we refresh the token when
        // only 1/10 of the token time is left.
        const renewMsBeforeExpires = Math.min(25_000, msBeforeExpiration * 0.1);

        log?.(
            [
                toHumanReadableDuration(msBeforeExpiration),
                `before expiration of the access token.`,
                `Scheduling renewal ${toHumanReadableDuration(renewMsBeforeExpires)} before expiration`
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
                await login_dueToExpiration();
            }
        }, msBeforeExpiration - renewMsBeforeExpires);

        const { unsubscribe: tokenChangeUnsubscribe } = oidc.subscribeToTokensChange(() => {
            clearTimeout(timer);
            tokenChangeUnsubscribe();
            scheduleRenew();
        });
    })();

    auto_logout: {
        if (currentTokens.refreshToken === "" && __unsafe_ssoSessionIdleSeconds === undefined) {
            log?.(
                "No refresh token, and ____unsafe_ssoSessionIdleSeconds was not set, auto logout non applicable"
            );
            break auto_logout;
        }

        const { startCountdown } = createStartCountdown({
            getCountdownEndTime: (() => {
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
            tickCallback: ({ secondsLeft }) => {
                Array.from(autoLogoutCountdownTickCallbacks).forEach(tickCallback =>
                    tickCallback({ secondsLeft })
                );

                if (secondsLeft === 0) {
                    oidc.logout(autoLogoutParams);
                }
            }
        });

        let stopCountdown: (() => void) | undefined = undefined;

        if (globalContext.$isUserActive === undefined) {
            globalContext.$isUserActive = create$isUserActive({
                configId,
                sessionId
            });
        }

        globalContext.$isUserActive.subscribe(isUserActive => {
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
