import {
    UserManager as OidcClientTsUserManager,
    WebStorageStateStore,
    type User as OidcClientTsUser,
    InMemoryWebStorage
} from "../vendor/frontend/oidc-client-ts-and-jwt-decode";
import { id, assert, is, type Equals, typeGuard } from "../vendor/frontend/tsafe";
import { setTimeout, clearTimeout } from "../tools/workerTimers";
import { Deferred } from "../tools/Deferred";
import { decodeJwt } from "../tools/decodeJwt";
import { createEvtIsUserActive } from "./evtIsUserActive";
import { createStartCountdown } from "../tools/startCountdown";
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
import { oidcClientTsUserToTokens, getMsBeforeExpiration } from "./oidcClientTsUserToTokens";
import { loginSilent, authResponseToUrl } from "./loginSilent";
import { handleOidcCallback, AUTH_RESPONSE_KEY } from "./handleOidcCallback";
import { getPersistedAuthState, persistAuthState } from "./persistedAuthState";
import type { Oidc } from "./Oidc";
import { createEvt, type Evt } from "../tools/Evt";
import { getHaveSharedParentDomain } from "../tools/haveSharedParentDomain";
import { createLoginOrGoToAuthServer } from "./loginOrGoToAuthServer";
import { createEphemeralSessionStorage } from "../tools/ephemeralSessionStorage";

handleOidcCallback();

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

    __unsafe_clientSecret?: string;

    /**
     *  WARNING: Setting this to true is a workaround for provider
     *  like Google OAuth that don't support JWT access token.
     *  Use at your own risk, this is a hack.
     */
    __unsafe_useIdTokenAsAccessToken?: boolean;
};

const GLOBAL_CONTEXT_KEY = "__oidc-spa.createOidc.globalContext";

declare global {
    interface Window {
        [GLOBAL_CONTEXT_KEY]: {
            prOidcByConfigId: Map<string, Promise<Oidc<any>>>;
            evtAuthResponseHandled: Evt<void>;
            hasLogoutBeenCalled: boolean;
            evtInstantiationWithNonAllowedThirdPartyCookies: Evt<void>;
            prLoginProcessOngoingByConfigId: Map<string, Promise<void>>;
        };
    }
}

window[GLOBAL_CONTEXT_KEY] ??= {
    prOidcByConfigId: new Map(),
    evtAuthResponseHandled: createEvt<void>(),
    hasLogoutBeenCalled: false,
    evtInstantiationWithNonAllowedThirdPartyCookies: createEvt<void>(),
    prLoginProcessOngoingByConfigId: new Map()
};

const globalContext = window[GLOBAL_CONTEXT_KEY];

const MIN_RENEW_BEFORE_EXPIRE_MS = 2_000;

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
        postLoginRedirectUrl: postLoginRedirectUrl_default,
        __unsafe_clientSecret,
        __unsafe_useIdTokenAsAccessToken = false
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

    const stateQueryParamValue_instance = generateStateQueryParamValue();

    let areThirdPartyCookiesAllowed: boolean;
    {
        const url1 = window.location.origin;
        const url2 = issuerUri;

        areThirdPartyCookiesAllowed = getHaveSharedParentDomain({
            url1,
            url2
        });

        if (areThirdPartyCookiesAllowed) {
            log?.(`${url1} and ${url2} have shared parent domain, third party cookies are allowed`);
        } else {
            log?.(
                [
                    `${url1} and ${url2} don't have shared parent domain, setting third party cookies`,
                    `on the auth server domain might not work. Making sure that everything works smoothly regardless`,
                    `by allowing oidc-spa to store the auth state in the session storage for a limited period of time.`
                ].join(" ")
            );
        }
    }

    let isUserStoreInMemoryOnly: boolean;

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
        userStore: new WebStorageStateStore({
            store: (() => {
                if (areThirdPartyCookiesAllowed) {
                    isUserStoreInMemoryOnly = true;
                    return new InMemoryWebStorage();
                }

                isUserStoreInMemoryOnly = false;

                const storage = createEphemeralSessionStorage({
                    sessionStorageTtlMs: 3 * 60_000
                });

                const { evtInstantiationWithNonAllowedThirdPartyCookies } = globalContext;

                if (evtInstantiationWithNonAllowedThirdPartyCookies.postCount !== 0) {
                    storage.enableEphemeralPersistence();
                } else {
                    const { unsubscribe } = evtInstantiationWithNonAllowedThirdPartyCookies.subscribe(
                        () => {
                            unsubscribe();
                            storage.enableEphemeralPersistence();
                        }
                    );
                }

                evtInstantiationWithNonAllowedThirdPartyCookies.post();

                return storage;
            })()
        }),
        stateStore: new WebStorageStateStore({ store: localStorage, prefix: STATE_STORE_KEY_PREFIX }),
        client_secret: __unsafe_clientSecret
    });

    const evtIsUserLoggedIn = createEvt<boolean>();

    const { loginOrGoToAuthServer } = createLoginOrGoToAuthServer({
        configId,
        oidcClientTsUserManager,
        getExtraQueryParams,
        transformUrlBeforeRedirect,
        homeAndCallbackUrl,
        evtIsUserLoggedIn,
        log
    });

    const BROWSER_SESSION_NOT_FIRST_INIT_KEY = `oidc-spa.browser-session-not-first-init:${configId}`;

    const dLoginProcessOngoing = new Deferred<void>();

    globalContext.prLoginProcessOngoingByConfigId.set(configId, dLoginProcessOngoing.pr);

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

        restore_from_session_storage: {
            if (isUserStoreInMemoryOnly) {
                break restore_from_session_storage;
            }

            let oidcClientTsUser: OidcClientTsUser | null;

            try {
                oidcClientTsUser = await oidcClientTsUserManager.getUser();
            } catch {
                // NOTE: Not sure if it can throw, but let's be safe.
                oidcClientTsUser = null;
                try {
                    await oidcClientTsUserManager.removeUser();
                } catch {}
            }

            if (oidcClientTsUser === null) {
                break restore_from_session_storage;
            }

            log?.("Restored the auth from ephemeral session storage");

            return {
                oidcClientTsUser,
                backFromAuthServer: undefined
            };
        }

        restore_from_http_only_cookie: {
            log?.("Trying to restore the auth from the http only cookie (silent signin with iframe)");

            const persistedAuthState = getPersistedAuthState({ configId });

            if (persistedAuthState === "explicitly logged out") {
                log?.("Skipping silent signin with iframe, the user has logged out");
                break restore_from_http_only_cookie;
            }

            const result_loginSilent = await loginSilent({
                oidcClientTsUserManager,
                stateQueryParamValue_instance,
                configId,
                getExtraTokenParams
            });

            assert(result_loginSilent.outcome !== "token refreshed using refresh token");

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

            assert<Equals<typeof result_loginSilent.outcome, "got auth response from iframe">>();

            const { authResponse } = result_loginSilent;

            log?.("Silent signin auth response", authResponse);

            const authResponse_error: string | undefined = authResponse["error"];
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

                if (authResponse_error === undefined) {
                    return error;
                }
            }

            if (oidcClientTsUser === undefined) {
                if (
                    autoLogin ||
                    (persistedAuthState === "logged in" &&
                        (authResponse_error === "interaction_required" ||
                            authResponse_error === "login_required" ||
                            authResponse_error === "consent_required" ||
                            authResponse_error === "account_selection_required"))
                ) {
                    persistAuthState({ configId, state: undefined });

                    dLoginProcessOngoing.resolve();

                    {
                        const prs = Array.from(globalContext.prLoginProcessOngoingByConfigId.entries())
                            .filter(([configId]) => configId !== configId)
                            .map(([, prLoginProcessOngoing]) => prLoginProcessOngoing);

                        if (prs.length !== 0) {
                            await Promise.all(prs);
                        }
                    }
                    await loginOrGoToAuthServer({
                        action: "login",
                        doForceReloadOnBfCache: true,
                        redirectUrl: window.location.href,
                        doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack: autoLogin,
                        extraQueryParams_local: undefined,
                        transformUrlBeforeRedirect_local: undefined,
                        doForceInteraction: false
                    });
                }

                log?.(
                    [
                        `The auth server responded with: ${authResponse_error} `,
                        "login_required" === authResponse_error
                            ? `(login_required just means that there's no active session for the user)`
                            : ""
                    ].join("")
                );

                break restore_from_http_only_cookie;
            }

            log?.("Successful silent signed in");

            return {
                oidcClientTsUser,
                backFromAuthServer: undefined
            };
        }

        // NOTE: The user is not logged in.
        return undefined;
    })();

    dLoginProcessOngoing.resolve();

    const oidc_common: Oidc.Common = {
        params: {
            issuerUri,
            clientId
        }
    };

    not_loggedIn_case: {
        if (!(resultOfLoginProcess instanceof Error) && resultOfLoginProcess !== undefined) {
            break not_loggedIn_case;
        }

        evtIsUserLoggedIn.post(false);

        if (getPersistedAuthState({ configId }) !== "explicitly logged out") {
            persistAuthState({ configId, state: undefined });
        }

        const oidc_notLoggedIn: Oidc.NotLoggedIn = (() => {
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

                return id<Oidc.NotLoggedIn>({
                    ...oidc_common,
                    isUserLoggedIn: false,
                    login: async () => {
                        alert("Authentication is currently unavailable. Please try again later.");
                        return new Promise<never>(() => {});
                    },
                    initializationError
                });
            }

            if (resultOfLoginProcess === undefined) {
                log?.("User not logged in");

                return id<Oidc.NotLoggedIn>({
                    ...oidc_common,
                    isUserLoggedIn: false,
                    login: ({
                        doesCurrentHrefRequiresAuth,
                        extraQueryParams,
                        redirectUrl,
                        transformUrlBeforeRedirect
                    }) =>
                        loginOrGoToAuthServer({
                            action: "login",
                            doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack:
                                doesCurrentHrefRequiresAuth,
                            doForceReloadOnBfCache: false,
                            redirectUrl:
                                redirectUrl ?? postLoginRedirectUrl_default ?? window.location.href,
                            extraQueryParams_local: extraQueryParams,
                            transformUrlBeforeRedirect_local: transformUrlBeforeRedirect,
                            doForceInteraction:
                                getPersistedAuthState({ configId }) === "explicitly logged out"
                        }),
                    initializationError: undefined
                });
            }

            assert<Equals<typeof resultOfLoginProcess, never>>(false);
        })();

        // @ts-expect-error: We know what we're doing
        return oidc_notLoggedIn;
    }

    log?.("User is logged in");

    evtIsUserLoggedIn.post(true);

    let currentTokens = oidcClientTsUserToTokens({
        oidcClientTsUser: resultOfLoginProcess.oidcClientTsUser,
        decodedIdTokenSchema,
        __unsafe_useIdTokenAsAccessToken,
        decodedIdToken_previous: undefined,
        log
    });

    {
        if (getPersistedAuthState({ configId }) !== undefined) {
            persistAuthState({ configId, state: undefined });
        }

        if (!areThirdPartyCookiesAllowed) {
            persistAuthState({
                configId,
                state: {
                    stateDescription: "logged in",
                    untilTime: currentTokens.refreshTokenExpirationTime
                }
            });
        }
    }

    const autoLogoutCountdownTickCallbacks = new Set<
        (params: { secondsLeft: number | undefined }) => void
    >();

    const onTokenChanges = new Set<(tokens: Oidc.Tokens<DecodedIdToken>) => void>();

    const oidc_loggedIn = id<Oidc.LoggedIn<DecodedIdToken>>({
        ...oidc_common,
        isUserLoggedIn: true,
        getTokens: () => currentTokens,
        getTokens_next: async () => {
            if (getMsBeforeExpiration(currentTokens) <= MIN_RENEW_BEFORE_EXPIRE_MS) {
                await oidc_loggedIn.renewTokens();
            }

            return currentTokens;
        },
        getDecodedIdToken: () => currentTokens.decodedIdToken,
        logout: async params => {
            if (globalContext.hasLogoutBeenCalled) {
                log?.("logout() has already been called, ignoring the call");
                return new Promise<never>(() => {});
            }

            globalContext.hasLogoutBeenCalled = true;

            window.addEventListener("pageshow", () => {
                location.reload();
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

                if (error.message === "No end session endpoint") {
                    log?.("No end session endpoint, managing logging state locally");

                    persistAuthState({ configId, state: { stateDescription: "explicitly logged out" } });

                    try {
                        await oidcClientTsUserManager.removeUser();
                    } catch {
                        // NOTE: Not sure if it can throw
                    }

                    window.location.href = postLogoutRedirectUrl;
                } else {
                    throw error;
                }
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
                    case "token refreshed using refresh token":
                        {
                            log?.("Refresh token used");
                            oidcClientTsUser = result_loginSilent.oidcClientTsUser;
                        }
                        break;
                    case "got auth response from iframe":
                        {
                            const { authResponse } = result_loginSilent;

                            log?.("Tokens refresh using iframe", authResponse);

                            const authResponse_error: string | undefined = authResponse["error"];

                            let oidcClientTsUser_scope: OidcClientTsUser | undefined = undefined;

                            try {
                                oidcClientTsUser_scope =
                                    await oidcClientTsUserManager.signinRedirectCallback(
                                        authResponseToUrl(authResponse)
                                    );
                            } catch (error) {
                                assert(error instanceof Error);

                                if (authResponse_error === undefined) {
                                    throw error;
                                }

                                oidcClientTsUser_scope = undefined;
                            }

                            if (oidcClientTsUser_scope === undefined) {
                                persistAuthState({ configId, state: undefined });

                                await loginOrGoToAuthServer({
                                    action: "login",
                                    redirectUrl: window.location.href,
                                    doForceReloadOnBfCache: true,
                                    extraQueryParams_local: undefined,
                                    transformUrlBeforeRedirect_local: undefined,
                                    doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack: false,
                                    doForceInteraction: false
                                });
                                assert(false);
                            }

                            oidcClientTsUser = oidcClientTsUser_scope;
                        }
                        break;
                    default:
                        assert<Equals<typeof result_loginSilent, never>>(false);
                        break;
                }

                currentTokens = oidcClientTsUserToTokens({
                    oidcClientTsUser,
                    decodedIdTokenSchema,
                    __unsafe_useIdTokenAsAccessToken,
                    decodedIdToken_previous: currentTokens.decodedIdToken,
                    log
                });

                if (getPersistedAuthState({ configId }) !== undefined) {
                    persistAuthState({
                        configId,
                        state: {
                            stateDescription: "logged in",
                            untilTime: currentTokens.refreshTokenExpirationTime
                        }
                    });
                }

                Array.from(onTokenChanges).forEach(onTokenChange => onTokenChange(currentTokens));
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
        goToAuthServer: ({ extraQueryParams, redirectUrl, transformUrlBeforeRedirect }) =>
            loginOrGoToAuthServer({
                action: "go to auth server",
                redirectUrl: redirectUrl ?? window.location.href,
                extraQueryParams_local: extraQueryParams,
                transformUrlBeforeRedirect_local: transformUrlBeforeRedirect
            }),
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
        const login_dueToExpiration = () => {
            persistAuthState({ configId, state: undefined });

            return loginOrGoToAuthServer({
                action: "login",
                redirectUrl: window.location.href,
                doForceReloadOnBfCache: true,
                extraQueryParams_local: undefined,
                transformUrlBeforeRedirect_local: undefined,
                // NOTE: Wether or not it's the preferred behavior, pushing to history
                // only works on user interaction so it have to be false
                doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack: false,
                doForceInteraction: true
            });
        };

        const msBeforeExpiration = getMsBeforeExpiration(currentTokens);

        if (msBeforeExpiration <= MIN_RENEW_BEFORE_EXPIRE_MS) {
            // NOTE: We just got a new token that is about to expire. This means that
            // the refresh token has reached it's max SSO time.
            login_dueToExpiration();
            return;
        }

        // NOTE: We refresh the token 25 seconds before it expires.
        // If the token expiration time is less than 25 seconds we refresh the token when
        // only 1/10 of the token time is left.
        const renewMsBeforeExpires = Math.max(
            Math.min(25_000, msBeforeExpiration * 0.1),
            MIN_RENEW_BEFORE_EXPIRE_MS
        );

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
                await oidc_loggedIn.renewTokens();
            } catch {
                await login_dueToExpiration();
            }
        }, msBeforeExpiration - renewMsBeforeExpires);

        const { unsubscribe: tokenChangeUnsubscribe } = oidc_loggedIn.subscribeToTokensChange(() => {
            clearTimeout(timer);
            tokenChangeUnsubscribe();
            scheduleRenew();
        });
    })();

    auto_logout: {
        if (
            (!currentTokens.hasRefreshToken || currentTokens.refreshTokenExpirationTime === undefined) &&
            __unsafe_ssoSessionIdleSeconds === undefined
        ) {
            log?.(
                `${
                    currentTokens.hasRefreshToken
                        ? "The refresh token is opaque, we can't read it's expiration time"
                        : "No refresh token"
                }, and __unsafe_ssoSessionIdleSeconds was not set, can't implement auto logout mechanism`
            );
            break auto_logout;
        }

        const { startCountdown } = createStartCountdown({
            getCountdownEndTime: (() => {
                const getCountdownEndTime = () =>
                    __unsafe_ssoSessionIdleSeconds !== undefined
                        ? Date.now() + __unsafe_ssoSessionIdleSeconds * 1000
                        : (assert(currentTokens.hasRefreshToken),
                          assert(currentTokens.refreshTokenExpirationTime !== undefined),
                          currentTokens.refreshTokenExpirationTime);

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
                    oidc_loggedIn.logout(autoLogoutParams);
                }
            }
        });

        let stopCountdown: (() => void) | undefined = undefined;

        const evtIsUserActive = createEvtIsUserActive({
            configId,
            sessionId
        });

        evtIsUserActive.subscribe(isUserActive => {
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

    return oidc_loggedIn;
}
