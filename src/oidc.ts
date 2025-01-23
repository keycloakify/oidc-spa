import {
    UserManager as OidcClientTsUserManager,
    WebStorageStateStore,
    InMemoryWebStorage,
    type User as OidcClientTsUser
} from "./vendor/frontend/oidc-client-ts-and-jwt-decode";
import { id } from "./vendor/frontend/tsafe";
import type { Param0 } from "./vendor/frontend/tsafe";
import { readExpirationTimeInJwt } from "./tools/readExpirationTimeInJwt";
import { assert, typeGuard, type Equals } from "./vendor/frontend/tsafe";
import {
    addQueryParamToUrl,
    retrieveQueryParamFromUrl,
    retrieveAllQueryParamFromUrl
} from "./tools/urlQueryParams";
import { fnv1aHashToHex } from "./tools/fnv1aHashToHex";
import { Deferred } from "./tools/Deferred";
import { decodeJwt } from "./tools/decodeJwt";
import { getDownlinkAndRtt } from "./tools/getDownlinkAndRtt";
import { createIsUserActive } from "./tools/createIsUserActive";
import { createStartCountdown } from "./tools/startCountdown";
import type { StatefulObservable } from "./tools/StatefulObservable";
import { setTimeout, clearTimeout } from "./vendor/frontend/worker-timers";
import { OidcInitializationError } from "./OidcInitializationError";
import { encodeBase64, decodeBase64 } from "./tools/base64";
import { toHumanReadableDuration } from "./tools/toHumanReadableDuration";

// NOTE: Replaced at build time
const VERSION = "{{OIDC_SPA_VERSION}}";

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
            /**
             * Add extra query parameters to the url before redirecting to the login pages.
             */
            extraQueryParams?: Record<string, string>;
            /**
             * Where to redirect after successful login.
             * Default: window.location.href (here)
             *
             * It does not need to include the origin, eg: "/dashboard"
             */
            redirectUrl?: string;

            /**
             * Transform the url before redirecting to the login pages.
             * Prefer using the extraQueryParams parameter if you're only adding query parameters.
             */
            transformUrlBeforeRedirect?: (url: string) => string;
        }) => Promise<never>;
        initializationError: OidcInitializationError | undefined;
    };

    export type LoggedIn<DecodedIdToken extends Record<string, unknown> = Record<string, unknown>> =
        Common & {
            isUserLoggedIn: true;
            renewTokens(params?: { extraTokenParams?: Record<string, string> }): Promise<void>;
            getTokens: () => Tokens<DecodedIdToken>;
            subscribeToTokensChange: (onTokenChange: () => void) => { unsubscribe: () => void };
            logout: (
                params:
                    | { redirectTo: "home" | "current page" }
                    | { redirectTo: "specific url"; url: string }
            ) => Promise<never>;
            goToAuthServer: (params: {
                extraQueryParams?: Record<string, string>;
                redirectUrl?: string;
                transformUrlBeforeRedirect?: (url: string) => string;
            }) => Promise<never>;
            subscribeToAutoLogoutCountdown: (
                tickCallback: (params: { secondsLeft: number | undefined }) => void
            ) => { unsubscribeFromAutoLogoutCountdown: () => void };
        } & (
                | {
                      /**
                       * "back from auth server":
                       *      The user was redirected to the authentication server login/registration page and then redirected back to the application.
                       * "session storage":
                       *    The user's authentication was restored from the browser session storage, typically after a page refresh.
                       * "silent signin":
                       *   The user was authenticated silently using an iframe to check the session with the authentication server.
                       */
                      authMethod: "back from auth server";
                      /**
                       * Defined when authMethod is "back from auth server".
                       * If you called `goToAuthServer` or `login` with extraQueryParams, this object let you know the outcome of the
                       * of the action that was intended.
                       *
                       * For example, on a Keycloak server, if you called `goToAuthServer({ extraQueryParams: { kc_action: "UPDATE_PASSWORD" } })`
                       * you'll get back: `{ extraQueryParams: { kc_action: "UPDATE_PASSWORD" }, result: { kc_action_status: "success" } }` (or "cancelled")
                       */
                      backFromAuthServer: {
                          extraQueryParams: Record<string, string>;
                          result: Record<string, string>;
                      };
                  }
                | {
                      authMethod: "session storage" | "silent signin";
                  }
            );

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

const PARAMS_TO_RETRIEVE_FROM_SUCCESSFUL_LOGIN = ["code", "state", "session_state", "iss"] as const;

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
     * This parameter is used to let oidc-spa knows where to find the silent-sso.htm file
     * and also to know what is the root path of your application so it can redirect to it after logout.
     *   - `${publicUrl}/silent-sso.htm` must return the `silent-sso.htm` that you are supposed to have created in your `public/` directory.
     *   - Navigating to publicUrl should redirect to the home of your App.
     *
     * What should you put in this parameter?
     *   - Vite project:             `publicUrl: import.meta.env.BASE_URL`
     *   - Create React App project: `publicUrl: process.env.PUBLIC_URL`
     *   - Other:                    `publicUrl: "/"` (Usually, or `/my-app-name` if your app is not at the root of the domain)
     *
     * If you've opted out of using the `silent-sso.htm` file you can set `publicUrl` to `undefined`.
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
    doEnableDebugLogs?: boolean;

    getDoContinueWithImpersonation?: (params: {
        parsedAccessToken: Record<string, unknown>;
    }) => Promise<boolean>;

    doDisableTokenPersistence?: boolean;
};

const prOidcByConfigHash = new Map<string, Promise<Oidc<any>>>();

function getConfigHash(params: { issuerUri: string; clientId: string }) {
    return fnv1aHashToHex(`${params.issuerUri} ${params.clientId}`);
}

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

// NOTE: This is not arbitrary, it matches what oidc-client-ts uses.
const SESSION_STORAGE_PREFIX = "oidc.";

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
        publicUrl: publicUrl_params,
        decodedIdTokenSchema,
        __unsafe_ssoSessionIdleSeconds,
        autoLogoutParams = { "redirectTo": "current page" },
        isAuthGloballyRequired = false,
        postLoginRedirectUrl,
        getDoContinueWithImpersonation,
        doDisableTokenPersistence = false
    } = params;

    const store = doDisableTokenPersistence ? new InMemoryWebStorage() : window.sessionStorage;

    const { issuerUri, clientId, scopes, configHash, log } = preProcessedParams;

    // NOTE: It's important that it is initialized here because of the garbage collection (see implementation).
    const { clearLogoutParams, getLogoutParams, setLogoutParams } = createLogoutPropagationApi({
        configHash
    });

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

    log?.(`Calling createOidc v${VERSION}`, { issuerUri, clientId, scopes, publicUrl, configHash });

    const silentSso =
        publicUrl === undefined
            ? {
                  "hasDedicatedHtmlFile": false,
                  "redirectUri": window.location.href
              }
            : {
                  "hasDedicatedHtmlFile": true,
                  "redirectUri": `${publicUrl}/silent-sso.htm`
              };

    log?.(`silent SSO:\n${JSON.stringify(silentSso, null, 2)}`);

    const IS_SILENT_SSO_RESERVED_QUERY_PARAM_NAME = "oidc-spa_silent_sso";
    const CONFIG_HASH_RESERVED_QUERY_PARAM_NAME = "oidc-spa_config_hash";

    silent_sso_polyfill: {
        if (
            !retrieveQueryParamFromUrl({
                "url": window.location.href,
                "name": IS_SILENT_SSO_RESERVED_QUERY_PARAM_NAME
            }).wasPresent
        ) {
            break silent_sso_polyfill;
        }

        {
            const result = retrieveQueryParamFromUrl({
                "url": window.location.href,
                "name": CONFIG_HASH_RESERVED_QUERY_PARAM_NAME
            });

            if (!result.wasPresent || result.value !== configHash) {
                break silent_sso_polyfill;
            }
        }

        if (silentSso.hasDedicatedHtmlFile) {
            log?.(
                [
                    "User forgot to create the silent-sso.htm file or the web server is not serving it correctly",
                    "suspending forever"
                ].join(" ")
            );
            // Here the user forget to create the silent-sso.htm file or or the web server is not serving it correctly
            // we shouldn't fall back to the SPA page.
            // In this case we want to let the timeout of the parent expire to provide the correct error message.
            await new Promise<never>(() => {});
        }

        log?.(
            "Silent SSO dedicated html file is not used, polyfilling the behavior by sending a message to the parent"
        );

        parent.postMessage(location.href, location.origin);

        await new Promise<never>(() => {});
    }

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
        "redirect_uri": "" /* provided when calling login */,
        "response_type": "code",
        "scope": Array.from(new Set(["openid", ...scopes])).join(" "),
        "automaticSilentRenew": false,
        "silent_redirect_uri": (() => {
            let { redirectUri } = silentSso;

            redirectUri = addQueryParamToUrl({
                "url": redirectUri,
                "name": CONFIG_HASH_RESERVED_QUERY_PARAM_NAME,
                "value": configHash
            }).newUrl;

            redirectUri = addQueryParamToUrl({
                "url": redirectUri,
                "name": IS_SILENT_SSO_RESERVED_QUERY_PARAM_NAME,
                "value": "true"
            }).newUrl;

            return redirectUri;
        })(),
        userStore: new WebStorageStateStore({ store })
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

    const RESULT_OMIT_RESERVED_QUERY_PARAM_NAME = "oidc-spa_result_omit";
    const EXTRA_QUERY_PARAMS_BACK_FROM_AUTH_SERVER_RESERVED_QUERY_PARAM_NAME = "oidc-spa_intent";

    type ParamsOfLoginOrGoToAuthServer = Omit<
        Param0<Oidc.NotLoggedIn["login"]>,
        "doesCurrentHrefRequiresAuth"
    > &
        ({ action: "login"; doesCurrentHrefRequiresAuth: boolean } | { action: "go to auth server" });

    const loginOrGoToAuthServer = async (params: ParamsOfLoginOrGoToAuthServer): Promise<never> => {
        const {
            extraQueryParams: extraQueryParams_fromLoginFn,
            redirectUrl,
            transformUrlBeforeRedirect: transformUrlBeforeRedirect_fromLoginFn,
            ...rest
        } = params;

        log?.("Calling loginOrGoToAuthServer", { params });

        login_only: {
            if (rest.action !== "login") {
                break login_only;
            }

            if (hasLoginBeenCalled) {
                log?.("login() has already been called, ignoring the call");
                return new Promise<never>(() => {});
            }

            hasLoginBeenCalled = true;
        }

        // NOTE: This is for handling cases when user press the back button on the login pages.
        // When the app is hosted on https (so not in dev mode) the browser will restore the state of the app
        // instead of reloading the page.
        login_only: {
            if (rest.action !== "login") {
                break login_only;
            }

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

        const redirect_uri = (() => {
            let url = (() => {
                if (redirectUrl === undefined) {
                    return window.location.href;
                }
                return redirectUrl.startsWith("/")
                    ? `${window.location.origin}${redirectUrl}`
                    : redirectUrl;
            })();

            url = addQueryParamToUrl({
                url,
                "name": CONFIG_HASH_RESERVED_QUERY_PARAM_NAME,
                "value": configHash
            }).newUrl;

            {
                const { values: queryParamsNamesToOmit_backFromAuthServer } =
                    retrieveAllQueryParamFromUrl({ url });

                url = addQueryParamToUrl({
                    url,
                    "name": RESULT_OMIT_RESERVED_QUERY_PARAM_NAME,
                    "value": encodeBase64(
                        JSON.stringify(Object.keys(queryParamsNamesToOmit_backFromAuthServer))
                    )
                }).newUrl;
            }

            {
                const extraQueryParams_backFromAuthServer: Record<string, string> =
                    extraQueryParams_fromLoginFn ?? {};

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

                    for (const [name, value] of Object.entries(
                        queryParamsAddedByTransformBeforeRedirect
                    )) {
                        extraQueryParams_backFromAuthServer[name] = value;
                    }
                }

                url = addQueryParamToUrl({
                    url,
                    "name": EXTRA_QUERY_PARAMS_BACK_FROM_AUTH_SERVER_RESERVED_QUERY_PARAM_NAME,
                    "value": encodeBase64(JSON.stringify(extraQueryParams_backFromAuthServer))
                }).newUrl;
            }

            return url;
        })();

        log?.(`redirect_uri: ${redirect_uri}`);

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

                            // NOTE: Put the redirect_uri at the end of the url to avoid
                            // for aesthetic reasons, to avoid having the oidc-spa specific query parameters
                            // being directly visible in the browser's address bar.
                            {
                                const name = "redirect_uri";

                                const result = retrieveQueryParamFromUrl({
                                    url,
                                    name
                                });

                                assert(result.wasPresent);

                                url = result.newUrl;

                                url = addQueryParamToUrl({
                                    url,
                                    name,
                                    "value": result.value
                                }).newUrl;
                            }

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

        await oidcClientTsUserManager.signinRedirect({
            redirect_uri,
            redirectMethod
        });
        return new Promise<never>(() => {});
    };

    const resultOfLoginProcess = await (async function getUser() {
        read_successful_login_query_params: {
            let url = window.location.href;

            const queryParameterNames_toCleanFromHref = new Set<string>();

            {
                const name = CONFIG_HASH_RESERVED_QUERY_PARAM_NAME;

                queryParameterNames_toCleanFromHref.add(name);

                const result = retrieveQueryParamFromUrl({
                    name,
                    url
                });

                if (!result.wasPresent || result.value !== configHash) {
                    break read_successful_login_query_params;
                }

                url = result.newUrl;
            }

            log?.("Back from the auth server, reading the query params to initialize the auth");

            let loginSuccessUrl = "https://dummy.com";

            let missingMandatoryParams: string[] = [];

            for (const name of PARAMS_TO_RETRIEVE_FROM_SUCCESSFUL_LOGIN) {
                queryParameterNames_toCleanFromHref.add(name);

                const result = retrieveQueryParamFromUrl({ name, url });

                if (!result.wasPresent) {
                    if (name === "iss" || name === "session_state") {
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

            let extraQueryParams_backFromAuthServer;

            {
                const name = EXTRA_QUERY_PARAMS_BACK_FROM_AUTH_SERVER_RESERVED_QUERY_PARAM_NAME;

                queryParameterNames_toCleanFromHref.add(name);

                const result = retrieveQueryParamFromUrl({
                    name,
                    url
                });

                assert(result.wasPresent);

                url = result.newUrl;

                extraQueryParams_backFromAuthServer = JSON.parse(decodeBase64(result.value)) as Record<
                    string,
                    string
                >;
            }

            let queryParamsNamesToOmit_backFromAuthServer;

            {
                const name = RESULT_OMIT_RESERVED_QUERY_PARAM_NAME;

                queryParameterNames_toCleanFromHref.add(name);

                const result = retrieveQueryParamFromUrl({
                    name,
                    url
                });

                assert(result.wasPresent);

                url = result.newUrl;

                queryParamsNamesToOmit_backFromAuthServer = JSON.parse(
                    decodeBase64(result.value)
                ) as string[];
            }

            let result_backFromAuthServer: Record<string, string> = {};

            {
                const { values } = retrieveAllQueryParamFromUrl({ url });

                for (const [name, value] of Object.entries(values)) {
                    if (queryParamsNamesToOmit_backFromAuthServer.includes(name)) {
                        continue;
                    }

                    queryParameterNames_toCleanFromHref.add(name);

                    result_backFromAuthServer[name] = value;

                    const result = retrieveQueryParamFromUrl({
                        name,
                        url
                    });

                    assert(result.wasPresent);

                    url = result.newUrl;
                }
            }

            log?.("Cleaning the url from the OIDC query parameters");

            {
                let count = 0;

                while (true) {
                    window.history.pushState(null, "", url);

                    await new Promise(resolve => setTimeout(resolve, 0));

                    const queryParameterNames_stillOnHref = Object.keys(
                        retrieveAllQueryParamFromUrl({ "url": window.location.href }).values
                    ).filter(name => queryParameterNames_toCleanFromHref.has(name));

                    if (queryParameterNames_stillOnHref.length === 0) {
                        break;
                    }

                    if (count === 5) {
                        throw new Error(
                            [
                                `Failed to clean the OIDC query parameters from the`,
                                `url with history.pushState after ${count} attempts`
                            ].join(" ")
                        );
                    }

                    log?.(
                        [
                            `Some oidc query params are still on the location.href after being cleaned`,
                            `They where probably added back by an external library. Retrying to remove them...\n`,
                            `Params still present: ${queryParameterNames_stillOnHref.join(", ")}`
                        ].join(" ")
                    );

                    url = window.location.href;

                    queryParameterNames_stillOnHref.forEach(name => {
                        const result = retrieveQueryParamFromUrl({
                            name,
                            url
                        });

                        assert(result.wasPresent);

                        url = result.newUrl;
                    });

                    count++;
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
                "authMethod": "back from auth server" as const,
                oidcClientTsUser,
                "backFromAuthServer": {
                    "extraQueryParams": extraQueryParams_backFromAuthServer,
                    "result": result_backFromAuthServer
                }
            };
        }

        restore_from_session: {
            let oidcClientTsUser = await oidcClientTsUserManager.getUser();

            if (oidcClientTsUser === null) {
                break restore_from_session;
            }

            log?.("Restoring the auth from the session storage");

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

                for (let i = 0; i < store.length; i++) {
                    const key = store.key(i);
                    assert(key !== null);
                    if (!key.startsWith(SESSION_STORAGE_PREFIX)) {
                        continue;
                    }
                    store.removeItem(key);
                }

                return undefined;
            }

            assert(oidcClientTsUser !== null);

            log?.("Session successfully restored and access token refreshed");

            return {
                "authMethod": "session storage" as const,
                oidcClientTsUser
            };
        }

        restore_from_http_only_cookie: {
            log?.("Trying to restore the auth from the httpOnly cookie (silent signin with iframe)");

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

                    const getSilentSsoReachabilityStatus = async (ext?: "html") =>
                        fetch(`${silentSso.redirectUri}${ext === "html" ? "l" : ""}`).then(
                            async response => {
                                dedicatedSilentSsoHtmlFileCsp =
                                    response.headers.get("Content-Security-Policy");

                                const content = await response.text();

                                return content.length < 250 &&
                                    content.includes("parent.postMessage(location.href")
                                    ? "ok"
                                    : "reachable but wrong content";
                            },
                            () => "not reachable" as const
                        );

                    const silentSsoHtmReachabilityStatus = await getSilentSsoReachabilityStatus();

                    if (silentSsoHtmReachabilityStatus === "ok") {
                        break silent_sso_html_unreachable;
                    }

                    dLoginSuccessUrl.reject(
                        new OidcInitializationError({
                            "type": "bad configuration",
                            "likelyCause": {
                                "type": "silent-sso.htm not properly served",
                                "silentSsoHtmlUrl": silentSso.redirectUri,
                                "likelyCause": await (async () => {
                                    if ((await getSilentSsoReachabilityStatus("html")) === "ok") {
                                        return "using .html instead of .htm extension";
                                    }

                                    switch (silentSsoHtmReachabilityStatus) {
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
                        result = retrieveQueryParamFromUrl({
                            "name": CONFIG_HASH_RESERVED_QUERY_PARAM_NAME,
                            url
                        });
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
                        log?.(`The auth server responded with: ${result.value}`);
                        dLoginSuccessUrl.resolve(undefined);
                        return;
                    }
                }

                let loginSuccessUrl = "https://dummy.com";

                const missingMandatoryParams: string[] = [];

                for (const name of PARAMS_TO_RETRIEVE_FROM_SUCCESSFUL_LOGIN) {
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
                .signinSilent({
                    "silentRequestTimeoutInSeconds": timeoutDelayMs / 1000,
                    "extraTokenParams": getExtraTokenParams?.()
                })
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
                log?.("There is no active session");
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

            log?.("Successful silent signed in");

            return {
                "authMethod": "silent signin" as const,
                oidcClientTsUser
            };
        }

        return undefined;
    })().then(
        result => {
            if (result === undefined) {
                return undefined;
            }

            const { oidcClientTsUser, authMethod, backFromAuthServer } = result;

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

            return { tokens, authMethod, backFromAuthServer };
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

    const assertSessionStorageNotCleared = () => {
        const hasOidcSessionStorageEntry = (() => {
            for (let i = 0; i < store.length; i++) {
                const key = store.key(i);
                assert(key !== null);

                if (!key.startsWith(SESSION_STORAGE_PREFIX)) {
                    continue;
                }

                return true;
            }

            return false;
        })();

        if (hasOidcSessionStorageEntry) {
            return;
        }

        throw new Error(
            [
                `You have manually cleared the sessionStorage. oidc-spa can't operate in this condition.`,
                `Make sure you do not delete the "oidc." prefixed entries in the sessionStorage.`
            ].join(" ")
        );
    };

    const oidc = id<Oidc.LoggedIn<DecodedIdToken>>({
        ...common,
        "isUserLoggedIn": true,
        "getTokens": () => currentTokens,
        "logout": async params => {
            assertSessionStorageNotCleared();

            setLogoutParams(params);

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

            assertSessionStorageNotCleared();

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
        ...(resultOfLoginProcess.authMethod === "back from auth server"
            ? (assert(resultOfLoginProcess.backFromAuthServer !== undefined),
              {
                  "authMethod": "back from auth server",
                  "backFromAuthServer": resultOfLoginProcess.backFromAuthServer
              })
            : {
                  "authMethod": resultOfLoginProcess.authMethod
              })
    });

    {
        clearLogoutParams();

        (async () => {
            while (true) {
                await new Promise(resolve => setTimeout(resolve, 1_000));

                const logoutParams = getLogoutParams();

                if (logoutParams === undefined) {
                    continue;
                }

                await oidc.logout(logoutParams);
            }
        })();
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

function oidcClientTsUserToTokens<DecodedIdToken extends Record<string, unknown>>(params: {
    oidcClientTsUser: OidcClientTsUser;
    decodedIdTokenSchema?: { parse: (data: unknown) => DecodedIdToken };
    log: ((message: string) => void) | undefined;
}): Oidc.Tokens<DecodedIdToken> {
    const { oidcClientTsUser, decodedIdTokenSchema, log } = params;

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

        log?.(
            [
                "Couldn't read the expiration time of the refresh token from the jwt",
                "It's ok. Some OIDC server like Microsoft Entra ID does not use JWT for the refresh token.",
                "Be aware that it prevent you from implementing the auto logout mechanism: https://docs.oidc-spa.dev/documentation/auto-logout",
                "If you need auto logout you'll have to provide use the __unsafe_ssoSessionIdleSeconds param."
            ].join("\n")
        );

        return Number.POSITIVE_INFINITY;
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

async function maybeImpersonate(params: {
    configHash: string;
    getDoContinueWithImpersonation: Exclude<
        ParamsOfCreateOidc["getDoContinueWithImpersonation"],
        undefined
    >;
    store: Storage;
    log: typeof console.log | undefined;
}) {
    const { configHash, getDoContinueWithImpersonation, store, log } = params;

    const value = (() => {
        const KEY = "oidc-spa_impersonate";

        from_url: {
            const result = retrieveQueryParamFromUrl({ "url": window.location.href, "name": KEY });

            if (!result.wasPresent) {
                break from_url;
            }

            log?.("Found impersonation query param in the url");

            window.history.replaceState({}, "", result.newUrl);

            store.setItem(KEY, result.value);

            return result.value;
        }

        from_session_storage: {
            const value = store.getItem(KEY);

            if (value === null) {
                break from_session_storage;
            }

            log?.("Found impersonation query param in the session storage");

            return value;
        }

        return undefined;
    })();

    if (value === undefined) {
        return;
    }

    const arr = JSON.parse(decodeBase64(value)) as {
        idToken: string;
        accessToken: string;
        refreshToken: string;
    }[];

    log?.("Impersonation params got:", arr);

    assert(arr instanceof Array);
    arr.forEach(item => {
        assert(item instanceof Object);
        const { accessToken, idToken, refreshToken } = item;
        assert(typeof accessToken === "string");
        assert(typeof idToken === "string");
        assert(typeof refreshToken === "string");
    });

    for (const { idToken, accessToken, refreshToken } of arr) {
        const parsedAccessToken = decodeJwt(accessToken) as any;

        assert(parsedAccessToken instanceof Object);
        const { iss, azp, sid, scope, exp, aud } = parsedAccessToken;
        assert(typeof iss === "string");
        assert(typeof azp === "string");
        assert(typeof sid === "string");
        assert(typeof scope === "string");
        assert(typeof exp === "number");
        assert(
            typeGuard<string[] | undefined>(
                aud,
                aud === undefined || (aud instanceof Array && aud.every(x => typeof x === "string"))
            )
        );

        const issuerUri = iss;

        const clientId = (() => {
            for (const clientId of [azp, ...(aud ?? [])]) {
                if (getConfigHash({ issuerUri, clientId }) === configHash) {
                    return clientId;
                }
            }

            return undefined;
        })();

        if (clientId === undefined) {
            log?.(
                [
                    `Skipping impersonation params entry`,
                    `doesn't match the current configuration of this oidc client`
                ].join(" ")
            );

            continue;
        }

        log?.(
            "Impersonation param matched with the current configuration, asking for confirmation before continuing"
        );

        const doContinue = await getDoContinueWithImpersonation({ parsedAccessToken });

        if (!doContinue) {
            log?.("Impersonation was canceled by the user");
            return;
        }

        log?.("Impersonation confirmed, storing the impersonation params in the session storage");

        store.setItem(
            `${SESSION_STORAGE_PREFIX}user:${issuerUri}:${clientId}`,
            JSON.stringify({
                "id_token": idToken,
                "session_state": sid,
                "access_token": accessToken,
                "refresh_token": refreshToken,
                "token_type": "Bearer",
                scope,
                "profile": parsedAccessToken,
                "expires_at": exp
            })
        );

        return;
    }

    log?.(
        "Impersonation skipped, no impersonation params matched the current configuration of this oidc client"
    );
}

function createLogoutPropagationApi(params: { configHash: string }) {
    const { configHash } = params;

    const KEY_PREFIX = "oidc-spa_logout-params_";

    const KEY = `${KEY_PREFIX}${configHash}`;

    type LogoutParams = Param0<Oidc.LoggedIn["logout"]>;

    type ParsedValue = { logoutParams: LogoutParams; expirationTime: number };

    function getIsParsedValue(value: unknown): value is ParsedValue {
        return (
            value instanceof Object &&
            "logoutParams" in value &&
            "expirationTime" in value &&
            typeof value.expirationTime === "number"
        );
    }

    function getParsedValue(): ParsedValue | undefined {
        const value = localStorage.getItem(KEY);

        if (value === null) {
            return undefined;
        }

        let parsedValue: unknown;

        try {
            parsedValue = JSON.parse(value);
            assert(getIsParsedValue(parsedValue));
        } catch {
            localStorage.removeItem(KEY);
            return undefined;
        }

        return parsedValue;
    }

    function setLogoutParams(params: LogoutParams) {
        const parsedValue: ParsedValue = {
            logoutParams: params,
            expirationTime: Date.now() + 7_000
        };
        localStorage.setItem(KEY, JSON.stringify(parsedValue));
    }

    function getLogoutParams(): LogoutParams | undefined {
        const parsedValue = getParsedValue();

        if (parsedValue === undefined) {
            return undefined;
        }

        const { logoutParams } = parsedValue;

        return logoutParams;
    }

    function clearLogoutParams() {
        localStorage.removeItem(KEY);
    }

    (function garbageCollect() {
        const { keys } = (() => {
            const keys: string[] = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);

                if (key === null) {
                    continue;
                }

                if (!key.startsWith(KEY_PREFIX)) {
                    continue;
                }

                keys.push(key);
            }

            return { keys };
        })();

        let doesNeedReschedule = false;

        const now = Date.now();

        for (const key of keys) {
            const parsedValue = getParsedValue();

            if (parsedValue === undefined) {
                continue;
            }

            const { expirationTime } = parsedValue;

            if (now > expirationTime) {
                localStorage.removeItem(key);
            } else {
                doesNeedReschedule = true;
            }
        }

        if (doesNeedReschedule) {
            setTimeout(() => garbageCollect(), 1_000);
        }
    })();

    return { setLogoutParams, getLogoutParams, clearLogoutParams };
}
