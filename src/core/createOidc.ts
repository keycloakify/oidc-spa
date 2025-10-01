import {
    UserManager as OidcClientTsUserManager,
    WebStorageStateStore,
    type User as OidcClientTsUser,
    InMemoryWebStorage
} from "../vendor/frontend/oidc-client-ts";
import type { OidcMetadata } from "./OidcMetadata";
import { assert, is, type Equals } from "../tools/tsafe/assert";
import { id } from "../tools/tsafe/id";
import { setTimeout, clearTimeout } from "../tools/workerTimers";
import { Deferred } from "../tools/Deferred";
import { createEvtIsUserActive } from "./evtIsUserActive";
import { createStartCountdown } from "../tools/startCountdown";
import { toHumanReadableDuration } from "../tools/toHumanReadableDuration";
import { toFullyQualifiedUrl } from "../tools/toFullyQualifiedUrl";
import { OidcInitializationError } from "./OidcInitializationError";
import {
    type StateData,
    generateStateUrlParamValue,
    STATE_STORE_KEY_PREFIX,
    getStateData
} from "./StateData";
import { notifyOtherTabsOfLogout, getPrOtherTabLogout } from "./logoutPropagationToOtherTabs";
import { notifyOtherTabsOfLogin, getPrOtherTabLogin } from "./loginPropagationToOtherTabs";
import { getConfigId } from "./configId";
import { oidcClientTsUserToTokens } from "./oidcClientTsUserToTokens";
import { loginSilent } from "./loginSilent";
import {
    authResponseToUrl,
    getPersistedRedirectAuthResponses,
    setPersistedRedirectAuthResponses,
    type AuthResponse
} from "./AuthResponse";
import { getRootRelativeOriginalLocationHref, getRedirectAuthResponse } from "./earlyInit";
import { getPersistedAuthState, persistAuthState } from "./persistedAuthState";
import type { Oidc } from "./Oidc";
import { createEvt } from "../tools/Evt";
import { getHaveSharedParentDomain } from "../tools/haveSharedParentDomain";
import {
    createLoginOrGoToAuthServer,
    getPrSafelyRestoredFromBfCacheAfterLoginBackNavigation
} from "./loginOrGoToAuthServer";
import { createEphemeralSessionStorage } from "../tools/EphemeralSessionStorage";
import {
    startLoginOrRefreshProcess,
    waitForAllOtherOngoingLoginOrRefreshProcessesToComplete
} from "./ongoingLoginOrRefreshProcesses";
import { createGetIsNewBrowserSession } from "./isNewBrowserSession";
import { getIsOnline } from "../tools/getIsOnline";
import { isKeycloak } from "../keycloak/isKeycloak";
import { INFINITY_TIME } from "../tools/INFINITY_TIME";

// NOTE: Replaced at build time
const VERSION = "{{OIDC_SPA_VERSION}}";

export type ParamsOfCreateOidc<
    DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base,
    AutoLogin extends boolean = false
> = {
    /**
     * What should you put in this parameter?
     *   - Vite project:             `BASE_URL: import.meta.env.BASE_URL`
     *   - Create React App project: `BASE_URL: process.env.PUBLIC_URL`
     *   - Other:                    `BASE_URL: "/"` (Usually, or `/dashboard` if your app is not at the root of the domain)
     */
    homeUrl: string;

    issuerUri: string;
    clientId: string;
    /**
     * The scopes being requested from the OIDC/OAuth2 provider (default: `["profile"]`
     * (the scope "openid" is added automatically as it's mandatory)
     **/
    scopes?: string[];

    /**
     * Transform the url (authorization endpoint) before redirecting to the login pages.
     *
     * The isSilent parameter is true when the redirect is initiated in the background iframe for silent signin.
     * This can be used to omit ui related query parameters (like `ui_locales`).
     */
    transformUrlBeforeRedirect?: (params: { authorizationUrl: string; isSilent: boolean }) => string;

    /**
     * Extra query params to be added to the authorization endpoint url before redirecting or silent signing in.
     * You can provide a function that returns those extra query params, it will be called
     * when login() is called.
     *
     * Example: extraQueryParams: ()=> ({ ui_locales: "fr" })
     *
     * This parameter can also be passed to login() directly.
     */
    extraQueryParams?:
        | Record<string, string | undefined>
        | ((params: { isSilent: boolean; url: string }) => Record<string, string | undefined>);
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
    extraTokenParams?: Record<string, string | undefined> | (() => Record<string, string | undefined>);
    /**
     * Usage discouraged, it's here because we don't want to assume too much on your
     * usecase but I can't think of a scenario where you would want anything
     * other than the current page.
     *
     * Where to redirect after successful login.
     * Default: window.location.href (here)
     *
     * It does not need to include the origin, eg: "/dashboard"
     *
     * This parameter can also be passed to login() directly as `redirectUrl`.
     */
    postLoginRedirectUrl?: string;

    decodedIdTokenSchema?: {
        parse: (decodedIdToken_original: Oidc.Tokens.DecodedIdToken_base) => DecodedIdToken;
    };

    /**
     * This parameter defines after how many seconds of inactivity the user should be
     * logged out automatically.
     *
     * WARNING: It should be configured on the identity server side
     * as it's the authoritative source for security policies and not the client.
     * If you don't provide this parameter it will be inferred from the refresh token expiration time.
     * */
    idleSessionLifetimeInSeconds?: number;

    /**
     * Usage discouraged, this parameter exists because we don't want to assume
     * too much about your usecase but I can't think of a scenario where you would
     * want anything other than the current page.
     *
     * Default: { redirectTo: "current page" }
     */
    autoLogoutParams?: Parameters<Oidc.LoggedIn<any>["logout"]>[0];
    autoLogin?: AutoLogin;

    /**
     * Default: false
     *
     * See: https://docs.oidc-spa.dev/v/v8/resources/iframe-related-issues
     */
    noIframe?: boolean;

    debugLogs?: boolean;

    /**
     * WARNING: This option exists solely as a workaround
     * for limitations in the Google OAuth API.
     * See: https://docs.oidc-spa.dev/providers-configuration/google-oauth
     *
     * Do not use this for other providers.
     * If you think you need a client secret in a SPA, you are likely
     * trying to use a confidential (private) client in the browser,
     * which is insecure and not supported.
     */
    __unsafe_clientSecret?: string;

    /**
     *  WARNING: Setting this to true is a workaround for provider
     *  like Google OAuth that don't support JWT access token.
     *  Use at your own risk, this is a hack.
     */
    __unsafe_useIdTokenAsAccessToken?: boolean;

    /**
     * This option should only be used as a last resort.
     *
     * If your OIDC provider is correctly configured, this should not be necessary.
     *
     * The metadata is normally retrieved automatically from:
     * `${issuerUri}/.well-known/openid-configuration`
     *
     * Use this only if that endpoint is not accessible (e.g. due to missing CORS headers
     * or non-standard deployments), and you cannot fix the server-side configuration.
     */
    __metadata?: Partial<OidcMetadata>;
};

const globalContext = {
    prOidcByConfigId: new Map<string, Promise<Oidc<any>>>(),
    hasLogoutBeenCalled: id<boolean>(false),
    evtRequestToPersistTokens: createEvt<{ configIdOfInstancePostingTheRequest: string }>()
};

globalContext.evtRequestToPersistTokens.subscribe(() => {
    const { authResponse } = getRedirectAuthResponse();

    if (authResponse === undefined) {
        return;
    }

    const { authResponses } = getPersistedRedirectAuthResponses();

    setPersistedRedirectAuthResponses({
        authResponses: [...authResponses, authResponse]
    });
});

/** @see: https://docs.oidc-spa.dev/v/v8/usage */
export async function createOidc<
    DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_base,
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
    DecodedIdToken extends Record<string, unknown>,
    AutoLogin extends boolean
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
        idleSessionLifetimeInSeconds,
        autoLogoutParams = { redirectTo: "current page" },
        autoLogin = false,
        postLoginRedirectUrl: postLoginRedirectUrl_default,
        __unsafe_clientSecret,
        __unsafe_useIdTokenAsAccessToken = false,
        __metadata,
        noIframe = false
    } = params;

    const { issuerUri, clientId, scopes, configId, log } = preProcessedParams;

    const getExtraQueryParams = (() => {
        if (extraQueryParamsOrGetter === undefined) {
            return undefined;
        }

        if (typeof extraQueryParamsOrGetter !== "function") {
            return () => extraQueryParamsOrGetter;
        }

        return extraQueryParamsOrGetter;
    })();

    const getExtraTokenParams = (() => {
        if (extraTokenParamsOrGetter === undefined) {
            return undefined;
        }

        if (typeof extraTokenParamsOrGetter !== "function") {
            return () => extraTokenParamsOrGetter;
        }

        return extraTokenParamsOrGetter;
    })();

    const homeUrlAndRedirectUri = toFullyQualifiedUrl({
        urlish: homeUrl_params,
        doAssertNoQueryParams: true,
        doOutputWithTrailingSlash: true
    });

    log?.(
        `Calling createOidc v${VERSION} ${JSON.stringify(
            {
                issuerUri,
                clientId,
                scopes,
                configId,
                homeUrlAndRedirectUri
            },
            null,
            2
        )}`
    );

    const stateUrlParamValue_instance = generateStateUrlParamValue();

    const canUseIframe = (() => {
        if (noIframe) {
            return false;
        }

        third_party_cookies: {
            const isOidcServerThirdPartyRelativeToApp =
                getHaveSharedParentDomain({
                    url1: window.location.origin,
                    url2: issuerUri
                }) === false;

            if (!isOidcServerThirdPartyRelativeToApp) {
                break third_party_cookies;
            }

            const isGoogleChrome = (() => {
                const ua = navigator.userAgent;
                const vendor = navigator.vendor;

                return (
                    /Chrome/.test(ua) && /Google Inc/.test(vendor) && !/Edg/.test(ua) && !/OPR/.test(ua)
                );
            })();

            if (window.location.origin.startsWith("http://localhost") && isGoogleChrome) {
                break third_party_cookies;
            }

            log?.(
                [
                    "Can't use iframe because your auth server is on a third party domain relative",
                    "to the domain of your app and third party cookies are blocked by navigators."
                ].join(" ")
            );

            return false;
        }

        // NOTE: Maybe not, it depend if the app can iframe itself.
        return true;
    })();

    let isUserStoreInMemoryOnly: boolean;

    const oidcClientTsUserManager = new OidcClientTsUserManager({
        stateUrlParamValue: stateUrlParamValue_instance,
        authority: issuerUri,
        client_id: clientId,
        redirect_uri: homeUrlAndRedirectUri,
        silent_redirect_uri: homeUrlAndRedirectUri,
        post_logout_redirect_uri: homeUrlAndRedirectUri,
        response_mode: isKeycloak({ issuerUri }) ? "fragment" : "query",
        response_type: "code",
        scope: Array.from(new Set(["openid", ...scopes])).join(" "),
        automaticSilentRenew: false,
        userStore: new WebStorageStateStore({
            store: (() => {
                if (canUseIframe) {
                    isUserStoreInMemoryOnly = true;
                    return new InMemoryWebStorage();
                }

                isUserStoreInMemoryOnly = false;

                const storage = createEphemeralSessionStorage({
                    sessionStorageTtlMs: 3 * 60_000
                });

                const { evtRequestToPersistTokens } = globalContext;

                evtRequestToPersistTokens.subscribe(({ configIdOfInstancePostingTheRequest }) => {
                    if (configIdOfInstancePostingTheRequest === configId) {
                        return;
                    }

                    storage.persistCurrentStateAndSubsequentChanges();
                });

                return storage;
            })()
        }),
        stateStore: new WebStorageStateStore({ store: localStorage, prefix: STATE_STORE_KEY_PREFIX }),
        client_secret: __unsafe_clientSecret,
        metadata: __metadata
    });

    const evtIsUserLoggedIn = createEvt<boolean>();

    const { loginOrGoToAuthServer } = createLoginOrGoToAuthServer({
        configId,
        oidcClientTsUserManager,
        transformUrlBeforeRedirect,
        getExtraQueryParams,
        getExtraTokenParams,
        homeUrl: homeUrlAndRedirectUri,
        evtIsUserLoggedIn,
        log
    });

    const { getIsNewBrowserSession } = createGetIsNewBrowserSession({
        configId,
        evtUserNotLoggedIn: (() => {
            const evt = createEvt<void>();

            evtIsUserLoggedIn.subscribe(isUserLoggedIn => {
                if (!isUserLoggedIn) {
                    evt.post();
                }
            });

            return evt;
        })()
    });

    const { completeLoginOrRefreshProcess } = await startLoginOrRefreshProcess();

    const resultOfLoginProcess = await (async (): Promise<
        | undefined // User is currently not logged in
        | Error // Initialization error
        | {
              oidcClientTsUser: OidcClientTsUser;
              backFromAuthServer: Oidc.LoggedIn["backFromAuthServer"]; // Undefined is silent signin
          }
    > => {
        handle_redirect_auth_response: {
            let stateDataAndAuthResponse:
                | { stateData: StateData.Redirect; authResponse: AuthResponse }
                | undefined = undefined;

            get_stateData_and_authResponse: {
                from_memory: {
                    const { authResponse, clearAuthResponse } = getRedirectAuthResponse();

                    if (authResponse === undefined) {
                        break from_memory;
                    }

                    const stateData = getStateData({ stateUrlParamValue: authResponse.state });

                    if (stateData === undefined) {
                        clearAuthResponse();
                        break from_memory;
                    }

                    if (stateData.configId !== configId) {
                        break from_memory;
                    }

                    assert(stateData.context === "redirect", "3229492");

                    clearAuthResponse();

                    stateDataAndAuthResponse = { stateData, authResponse };

                    break get_stateData_and_authResponse;
                }

                // from storage, this is for race condition in multiple instance
                // setup where one instance would need to redirect before
                // the authResponse in memory had the chance to be processed.
                // This can only happen if:
                // 1) There are multiple oidc instances in the App.
                // 2) They are instantiated in a non deterministic order.
                // 3) We can't use iframe
                // We practically never persist the auth response and do it only in session
                // an ephemeral session storage, when we know it's gonna be required.
                {
                    const { authResponses } = getPersistedRedirectAuthResponses();

                    for (const authResponse of authResponses) {
                        const stateData = getStateData({ stateUrlParamValue: authResponse.state });

                        if (stateData === undefined) {
                            continue;
                        }

                        if (stateData.configId !== configId) {
                            continue;
                        }

                        assert(stateData.context === "redirect", "35935591");

                        setPersistedRedirectAuthResponses({
                            authResponses: authResponses.filter(
                                authResponse_i => authResponse_i !== authResponse
                            )
                        });

                        stateDataAndAuthResponse = { stateData, authResponse };

                        break get_stateData_and_authResponse;
                    }
                }
            }

            if (stateDataAndAuthResponse === undefined) {
                break handle_redirect_auth_response;
            }

            const { stateData, authResponse } = stateDataAndAuthResponse;

            switch (stateData.action) {
                case "login":
                    {
                        log?.(
                            `Handling login redirect auth response ${JSON.stringify(
                                authResponse,
                                null,
                                2
                            )}`
                        );

                        const authResponseUrl = authResponseToUrl(authResponse);

                        let oidcClientTsUser: OidcClientTsUser | undefined = undefined;

                        try {
                            oidcClientTsUser = await oidcClientTsUserManager.signinRedirectCallback(
                                authResponseUrl
                            );
                        } catch (error) {
                            assert(error instanceof Error, "741947");

                            if (error.message === "Failed to fetch") {
                                return (
                                    await import("./diagnostic")
                                ).createFailedToFetchTokenEndpointInitializationError({
                                    clientId,
                                    issuerUri
                                });
                            }

                            {
                                const authResponse_error = authResponse.error;

                                if (authResponse_error !== undefined) {
                                    log?.(
                                        `The auth server responded with: ${authResponse_error}, trying to restore from the http only cookie`
                                    );
                                    break handle_redirect_auth_response;
                                }
                            }

                            return error;
                        }

                        notifyOtherTabsOfLogin({ configId });

                        return {
                            oidcClientTsUser,
                            backFromAuthServer: {
                                extraQueryParams: stateData.extraQueryParams,
                                result: Object.fromEntries(
                                    Object.entries(authResponse)
                                        .map(([name, value]) => {
                                            if (
                                                name === "state" ||
                                                name === "session_state" ||
                                                name === "iss" ||
                                                name === "code"
                                            ) {
                                                return undefined;
                                            }

                                            if (value === undefined) {
                                                return undefined;
                                            }

                                            return [name, value];
                                        })
                                        .filter(entry => entry !== undefined)
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

                        notifyOtherTabsOfLogout({
                            configId,
                            sessionId: stateData.sessionId
                        });

                        if (autoLogin) {
                            location.reload();
                            await new Promise<never>(() => {});
                        }

                        // NOTE: The user is no longer logged in.
                        return undefined;
                    }
                    break;
                default:
                    assert<Equals<typeof stateData, never>>(false);
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

        silent_login_if_possible_and_auto_login: {
            const persistedAuthState = getPersistedAuthState({ configId });

            if (persistedAuthState === "explicitly logged out" && !autoLogin) {
                log?.("Skipping silent signin with iframe, the user has logged out");
                break silent_login_if_possible_and_auto_login;
            }

            {
                const { isOnline, prOnline } = getIsOnline();

                if (!isOnline) {
                    if (autoLogin) {
                        log?.(
                            [
                                "The browser is currently offline",
                                "Since autoLogin is enabled we wait until it comes back online",
                                "to continue with authentication"
                            ].join(" ")
                        );
                        await prOnline;
                    } else {
                        log?.(
                            [
                                "The browser is not currently online so we proceed with initialization",
                                "assuming the user isn't authenticated"
                            ].join(" ")
                        );
                        break silent_login_if_possible_and_auto_login;
                    }
                }
            }

            let authResponse_error: string | undefined = undefined;
            let oidcClientTsUser: OidcClientTsUser | undefined = undefined;

            actual_silent_signin: {
                if (persistedAuthState === "explicitly logged out") {
                    break actual_silent_signin;
                }

                if (!canUseIframe) {
                    break actual_silent_signin;
                }

                log?.(
                    "Trying to restore the auth from the http only cookie (silent signin with iframe)"
                );

                const result_loginSilent = await loginSilent({
                    oidcClientTsUserManager,
                    stateUrlParamValue_instance,
                    configId,
                    transformUrlBeforeRedirect,
                    getExtraQueryParams,
                    getExtraTokenParams,
                    autoLogin
                });

                assert(result_loginSilent.outcome !== "token refreshed using refresh token", "876995");

                if (result_loginSilent.outcome === "failure") {
                    switch (result_loginSilent.cause) {
                        case "can't reach well-known oidc endpoint":
                            return (
                                await import("./diagnostic")
                            ).createWellKnownOidcConfigurationEndpointUnreachableInitializationError({
                                issuerUri
                            });
                        case "timeout":
                            return (await import("./diagnostic")).createIframeTimeoutInitializationError(
                                {
                                    redirectUri: homeUrlAndRedirectUri,
                                    clientId,
                                    issuerUri,
                                    noIframe
                                }
                            );
                    }

                    assert<Equals<typeof result_loginSilent.cause, never>>(false);
                }

                assert<Equals<typeof result_loginSilent.outcome, "got auth response from iframe">>();

                const { authResponse } = result_loginSilent;

                log?.(`Silent signin auth response ${JSON.stringify(authResponse, null, 2)}`);

                authResponse_error = authResponse.error;

                try {
                    oidcClientTsUser = await oidcClientTsUserManager.signinRedirectCallback(
                        authResponseToUrl(authResponse)
                    );
                } catch (error) {
                    assert(error instanceof Error, "433344");

                    if (error.message === "Failed to fetch") {
                        return (
                            await import("./diagnostic")
                        ).createFailedToFetchTokenEndpointInitializationError({
                            clientId,
                            issuerUri
                        });
                    }

                    if (authResponse_error === undefined) {
                        return error;
                    }
                }
            }

            if (oidcClientTsUser === undefined) {
                if (
                    autoLogin ||
                    (persistedAuthState === "logged in" &&
                        (authResponse_error === undefined ||
                            authResponse_error === "interaction_required" ||
                            authResponse_error === "login_required" ||
                            authResponse_error === "consent_required" ||
                            authResponse_error === "account_selection_required"))
                ) {
                    log?.("Performing auto login with redirect");

                    persistAuthState({ configId, state: undefined });

                    completeLoginOrRefreshProcess();

                    if (autoLogin && persistedAuthState !== "logged in") {
                        evtIsUserLoggedIn.post(false);
                    }

                    await waitForAllOtherOngoingLoginOrRefreshProcessesToComplete({
                        prUnlock: new Promise<never>(() => {})
                    });

                    if (persistedAuthState === "logged in") {
                        globalContext.evtRequestToPersistTokens.post({
                            configIdOfInstancePostingTheRequest: configId
                        });
                    }

                    await loginOrGoToAuthServer({
                        action: "login",
                        doForceReloadOnBfCache: true,
                        redirectUrl: getRootRelativeOriginalLocationHref(),
                        // NOTE: Wether or not it's the preferred behavior, pushing to history
                        // only works on user interaction so it have to be false
                        doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack: false,
                        extraQueryParams_local: undefined,
                        transformUrlBeforeRedirect_local: undefined,
                        interaction: (() => {
                            if (persistedAuthState === "explicitly logged out") {
                                return "ensure interaction";
                            }

                            if (autoLogin) {
                                return "directly redirect if active session show login otherwise";
                            }

                            return "ensure no interaction";
                        })()
                    });
                    assert(false, "321389");
                }

                if (authResponse_error !== undefined) {
                    log?.(
                        [
                            `The auth server responded with: ${authResponse_error} `,
                            "login_required" === authResponse_error
                                ? `(login_required just means that there's no active session for the user)`
                                : ""
                        ].join("")
                    );
                }

                break silent_login_if_possible_and_auto_login;
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

    completeLoginOrRefreshProcess();

    await waitForAllOtherOngoingLoginOrRefreshProcessesToComplete({
        prUnlock: Promise.resolve()
    });

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
                    login: async ({
                        doesCurrentHrefRequiresAuth,
                        extraQueryParams,
                        redirectUrl,
                        transformUrlBeforeRedirect
                    }) => {
                        await waitForAllOtherOngoingLoginOrRefreshProcessesToComplete({
                            prUnlock: getPrSafelyRestoredFromBfCacheAfterLoginBackNavigation()
                        });

                        return loginOrGoToAuthServer({
                            action: "login",
                            doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack:
                                doesCurrentHrefRequiresAuth,
                            doForceReloadOnBfCache: false,
                            redirectUrl:
                                redirectUrl ?? postLoginRedirectUrl_default ?? window.location.href,
                            extraQueryParams_local: extraQueryParams,
                            transformUrlBeforeRedirect_local: transformUrlBeforeRedirect,
                            interaction:
                                getPersistedAuthState({ configId }) === "explicitly logged out"
                                    ? "ensure interaction"
                                    : "directly redirect if active session show login otherwise"
                        });
                    },
                    initializationError: undefined
                });
            }

            assert<Equals<typeof resultOfLoginProcess, never>>(false);
        })();

        {
            const { prOtherTabLogin } = getPrOtherTabLogin({
                configId
            });

            prOtherTabLogin.then(async () => {
                log?.(`Other tab has logged in, reloading this tab`);

                await waitForAllOtherOngoingLoginOrRefreshProcessesToComplete({
                    prUnlock: new Promise<never>(() => {})
                });

                window.location.reload();
            });
        }

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

        if (!canUseIframe) {
            persistAuthState({
                configId,
                state: {
                    stateDescription: "logged in",
                    refreshTokenExpirationTime: currentTokens.refreshTokenExpirationTime,
                    idleSessionLifetimeInSeconds
                }
            });
        }
    }

    const autoLogoutCountdownTickCallbacks = new Set<
        (params: { secondsLeft: number | undefined }) => void
    >();

    const onTokenChanges = new Set<(tokens: Oidc.Tokens<DecodedIdToken>) => void>();

    const { sid: sessionId, sub: subjectId } = currentTokens.decodedIdToken_original;

    assert(subjectId !== undefined, "The 'sub' claim is missing from the id token");
    assert(sessionId === undefined || typeof sessionId === "string");

    let wouldHaveAutoLoggedOutIfBrowserWasOnline = false;

    let prOngoingTokenRenewal: Promise<void> | undefined = undefined;

    const oidc_loggedIn = id<Oidc.LoggedIn<DecodedIdToken>>({
        ...oidc_common,
        isUserLoggedIn: true,
        getTokens: async () => {
            if (wouldHaveAutoLoggedOutIfBrowserWasOnline) {
                await oidc_loggedIn.logout(autoLogoutParams);
                assert(false);
            }

            if (prOngoingTokenRenewal === undefined) {
                // NOTE: Give a chance to renewOnLocalTimeShift to do it's job
                await new Promise<void>(resolve => setTimeout(resolve, 0));
            }

            if (prOngoingTokenRenewal !== undefined) {
                await prOngoingTokenRenewal;
            }

            renew_tokens: {
                {
                    const msBeforeExpirationOfTheAccessToken =
                        currentTokens.accessTokenExpirationTime - currentTokens.getServerDateNow();

                    if (msBeforeExpirationOfTheAccessToken > 30_000) {
                        break renew_tokens;
                    }
                }

                {
                    const msElapsedSinceCurrentTokenWereIssued =
                        currentTokens.getServerDateNow() - currentTokens.issuedAtTime;

                    if (msElapsedSinceCurrentTokenWereIssued < 5_000) {
                        break renew_tokens;
                    }
                }

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

            const rootRelativePostLogoutRedirectUrl: string = (() => {
                switch (params.redirectTo) {
                    case "current page":
                        return window.location.href;
                    case "home":
                        return homeUrlAndRedirectUri;
                    case "specific url":
                        return toFullyQualifiedUrl({
                            urlish: params.url,
                            doAssertNoQueryParams: false
                        });
                }
            })().slice(window.location.origin.length);

            await waitForAllOtherOngoingLoginOrRefreshProcessesToComplete({
                prUnlock: new Promise<never>(() => {})
            });

            window.addEventListener("pageshow", event => {
                if (!event.persisted) {
                    return;
                }
                location.reload();
            });

            try {
                await oidcClientTsUserManager.signoutRedirect({
                    state: id<StateData.Redirect>({
                        configId,
                        context: "redirect",
                        rootRelativeRedirectUrl: rootRelativePostLogoutRedirectUrl,
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

                    notifyOtherTabsOfLogout({
                        configId,
                        sessionId
                    });

                    window.location.href = rootRelativePostLogoutRedirectUrl;
                } else {
                    throw error;
                }
            }

            return new Promise<never>(() => {});
        },
        renewTokens: (() => {
            // NOTE: Cannot throw (or if it does it's our fault)
            async function renewTokens_nonMutexed(params: {
                extraTokenParams: Record<string, string | undefined>;
            }) {
                const { extraTokenParams } = params;

                const fallbackToFullPageReload = async (): Promise<never> => {
                    persistAuthState({ configId, state: undefined });

                    await waitForAllOtherOngoingLoginOrRefreshProcessesToComplete({
                        prUnlock: new Promise<never>(() => {})
                    });

                    globalContext.evtRequestToPersistTokens.post({
                        configIdOfInstancePostingTheRequest: configId
                    });

                    await loginOrGoToAuthServer({
                        action: "login",
                        redirectUrl: window.location.href,
                        doForceReloadOnBfCache: true,
                        extraQueryParams_local: undefined,
                        transformUrlBeforeRedirect_local: undefined,
                        doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack: false,
                        interaction: "directly redirect if active session show login otherwise"
                    });
                    assert(false, "136134");
                };

                if (!currentTokens.hasRefreshToken && !canUseIframe) {
                    log?.(
                        [
                            "Unable to refresh tokens without a full app reload,",
                            "because no refresh token is available",
                            "and your app setup prevents silent sign-in via iframe.",
                            "Your only option to refresh tokens is to call `window.location.reload()`"
                        ].join(" ")
                    );

                    await fallbackToFullPageReload();

                    assert(false, "136135");
                }

                log?.("Renewing tokens");

                const { completeLoginOrRefreshProcess } = await startLoginOrRefreshProcess();

                const result_loginSilent = await loginSilent({
                    oidcClientTsUserManager,
                    stateUrlParamValue_instance,
                    configId,
                    transformUrlBeforeRedirect,
                    getExtraQueryParams,
                    getExtraTokenParams: () => extraTokenParams,
                    autoLogin
                });

                if (result_loginSilent.outcome === "failure") {
                    completeLoginOrRefreshProcess();
                    // NOTE: This is a configuration or network error, okay to throw,
                    // this exception doesn't have to be handle if it fails it fails.
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

                            const authResponse_error = authResponse.error;

                            let oidcClientTsUser_scope: OidcClientTsUser | undefined = undefined;

                            try {
                                oidcClientTsUser_scope =
                                    await oidcClientTsUserManager.signinRedirectCallback(
                                        authResponseToUrl(authResponse)
                                    );
                            } catch (error) {
                                assert(error instanceof Error, "321389");

                                if (authResponse_error === undefined) {
                                    completeLoginOrRefreshProcess();
                                    // Same here, if it fails it fails.
                                    throw error;
                                }
                            }

                            if (oidcClientTsUser_scope === undefined) {
                                // NOTE: Here we got a response but it's an error, session might have been
                                // deleted or other edge case.

                                completeLoginOrRefreshProcess();

                                log?.(
                                    [
                                        "The user is probably not logged in anymore,",
                                        "need to redirect to login pages"
                                    ].join(" ")
                                );

                                await fallbackToFullPageReload();

                                assert(false, "136135");
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
                            refreshTokenExpirationTime: currentTokens.refreshTokenExpirationTime,
                            idleSessionLifetimeInSeconds
                        }
                    });
                }

                Array.from(onTokenChanges).forEach(onTokenChange => onTokenChange(currentTokens));

                completeLoginOrRefreshProcess();
            }

            let ongoingCall:
                | {
                      pr: Promise<void>;
                      extraTokenParams: Record<string, string | undefined>;
                  }
                | undefined = undefined;

            function handleThen() {
                assert(ongoingCall !== undefined, "131276");

                const { pr } = ongoingCall;

                pr.then(() => {
                    assert(ongoingCall !== undefined, "549462");

                    if (ongoingCall.pr !== pr) {
                        return;
                    }

                    ongoingCall = undefined;
                });
            }

            async function renewTokens_mutexed(params: {
                extraTokenParams?: Record<string, string | undefined>;
            }) {
                const { extraTokenParams: extraTokenParams_local } = params;

                const extraTokenParams = {
                    ...getExtraTokenParams?.(),
                    ...extraTokenParams_local
                };

                if (ongoingCall === undefined) {
                    ongoingCall = {
                        pr: renewTokens_nonMutexed({ extraTokenParams }),
                        extraTokenParams
                    };

                    handleThen();

                    return ongoingCall.pr;
                }

                if (JSON.stringify(extraTokenParams) === JSON.stringify(ongoingCall.extraTokenParams)) {
                    return ongoingCall.pr;
                }

                ongoingCall = {
                    pr: (async () => {
                        await ongoingCall.pr;

                        return renewTokens_nonMutexed({ extraTokenParams });
                    })(),
                    extraTokenParams
                };

                handleThen();

                return ongoingCall.pr;
            }

            return params => {
                const { extraTokenParams } = params ?? {};

                prOngoingTokenRenewal = renewTokens_mutexed({ extraTokenParams });

                prOngoingTokenRenewal.then(() => {
                    prOngoingTokenRenewal = undefined;
                });

                return prOngoingTokenRenewal;
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
            const value = getIsNewBrowserSession({ subjectId });

            log?.(`isNewBrowserSession: ${value}`);

            return value;
        })()
    });

    {
        const { prOtherTabLogout } = getPrOtherTabLogout({
            configId,
            sessionId
        });

        prOtherTabLogout.then(async () => {
            log?.(`Other tab has logged out, refreshing current tab`);

            await waitForAllOtherOngoingLoginOrRefreshProcessesToComplete({
                prUnlock: new Promise<never>(() => {})
            });

            location.reload();
        });
    }

    // NOTE: Pessimistic renewal of token on potential clock adjustment.
    (function renewOnLocalTimeShift() {
        // NOTE: If we can't confidently silently refresh tokens we won't risk reloading
        // the page just to cover the local time drift edge case.
        if (!currentTokens.hasRefreshToken && !canUseIframe) {
            return;
        }

        let timer: ReturnType<typeof setTimeout> | undefined = undefined;

        const DELAY = 5_000;

        (async () => {
            while (true) {
                const before = Date.now();
                await new Promise<void>(resolve => {
                    timer = setTimeout(resolve, DELAY);
                });
                const after = Date.now();

                const elapsed_measured = after - before;
                const elapsed_theoretical = DELAY;

                if (Math.abs(elapsed_measured - elapsed_theoretical) > 1_000) {
                    log?.("Renewing token now as local time might have shifted");
                    // NOTE: This **will** happen, even if there is no local time drift.
                    // For example when the computer wakes up after sleep.
                    // But it doesn't matter, we'll just make a token renewal that was probably
                    // not necessary. It's best than risking to deem expired token as valid.
                    oidc_loggedIn.renewTokens();
                    return;
                }
            }
        })();

        const { unsubscribe: tokenChangeUnsubscribe } = oidc_loggedIn.subscribeToTokensChange(() => {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
            tokenChangeUnsubscribe();
            renewOnLocalTimeShift();
        });
    })();

    (function scheduleRenew() {
        if (!currentTokens.hasRefreshToken && !canUseIframe) {
            log?.(
                [
                    "Disabling token auto refresh mechanism because we",
                    "have no way to renew the tokens without a full page reload"
                ].join(" ")
            );
            return;
        }

        if (
            currentTokens.refreshTokenExpirationTime !== undefined &&
            currentTokens.refreshTokenExpirationTime >= INFINITY_TIME
        ) {
            log?.("The refresh_token never expires, disabling auto-renewal mechanism");
            return;
        }

        const msBeforeExpiration =
            (currentTokens.refreshTokenExpirationTime ?? currentTokens.accessTokenExpirationTime) -
            currentTokens.getServerDateNow();

        const typeOfTheTokenWeGotTheTtlFrom =
            currentTokens.refreshTokenExpirationTime !== undefined ? "refresh" : "access";

        const RENEW_MS_BEFORE_EXPIRES = 30_000;

        if (msBeforeExpiration <= RENEW_MS_BEFORE_EXPIRES) {
            log?.(
                [
                    "Disabling auto renew mechanism. We just got fresh tokens",
                    (() => {
                        switch (typeOfTheTokenWeGotTheTtlFrom) {
                            case "refresh":
                                return [
                                    " and the refresh token is already about to expires.",
                                    "This means that we have reached the max session lifespan, we can't keep",
                                    "the session alive any longer.",
                                    "(This can also mean that the refresh token was configured with a TTL,",
                                    "aka the idle session lifespan, too low to make sense)"
                                ].join(" ");
                            case "access":
                                return [
                                    currentTokens.hasRefreshToken
                                        ? ", we can't read the expiration time of the refresh token"
                                        : ", we don't have a refresh token",
                                    ` and the access token is already about to expire`,
                                    "we would spam the auth server by constantly renewing the access token in the background",
                                    "avoiding to do so."
                                ].join(" ");
                        }
                    })()
                ].join(" ")
            );
            return;
        }

        log?.(
            [
                toHumanReadableDuration(msBeforeExpiration),
                `before expiration of the ${typeOfTheTokenWeGotTheTtlFrom} token.`,
                `Scheduling renewal ${toHumanReadableDuration(
                    RENEW_MS_BEFORE_EXPIRES
                )} before expiration to keep the session alive on the OIDC server.`
            ].join(" ")
        );

        const timer = setTimeout(
            async () => {
                {
                    const { isOnline, prOnline } = getIsOnline();

                    if (!isOnline) {
                        const didCameBackOnlineInTime = await Promise.race([
                            new Promise<false>(resolve =>
                                setTimeout(() => resolve(false), RENEW_MS_BEFORE_EXPIRES - 1_000)
                            ),
                            prOnline.then(() => true)
                        ]);

                        if (!didCameBackOnlineInTime) {
                            log?.(
                                [
                                    "The session expired on the OIDC server.",
                                    "We couldn't keep it alive because the browser was offline.",
                                    "We are not redirecting to the login page to support PWAs with offline features.",
                                    "However, the next getTokens() call will trigger a redirect to the Auth server login page."
                                ].join(" ")
                            );
                            return;
                        }
                    }
                }

                log?.(
                    `Renewing the tokens now as the ${typeOfTheTokenWeGotTheTtlFrom} token will expire in ${toHumanReadableDuration(
                        RENEW_MS_BEFORE_EXPIRES
                    )}`
                );

                await oidc_loggedIn.renewTokens();
            },
            Math.min(
                msBeforeExpiration - RENEW_MS_BEFORE_EXPIRES,
                // NOTE: We want to make sure we do not overflow the setTimeout
                // that must be a 32 bit unsigned integer.
                // This can happen if the tokenExpirationTime is more than 24.8 days in the future.
                Math.pow(2, 31) - 1
            )
        );

        const { unsubscribe: tokenChangeUnsubscribe } = oidc_loggedIn.subscribeToTokensChange(() => {
            clearTimeout(timer);
            tokenChangeUnsubscribe();
            scheduleRenew();
        });
    })();

    auto_logout: {
        const getCurrentRefreshTokenTtlInSeconds = () => {
            if (idleSessionLifetimeInSeconds !== undefined) {
                return idleSessionLifetimeInSeconds;
            }

            if (currentTokens.refreshTokenExpirationTime === undefined) {
                return undefined;
            }

            if (currentTokens.refreshTokenExpirationTime >= INFINITY_TIME) {
                return 0;
            }

            return (currentTokens.refreshTokenExpirationTime - currentTokens.issuedAtTime) / 1000;
        };

        if (getCurrentRefreshTokenTtlInSeconds() === 0) {
            log?.("The refresh_token never expires, disabling auto logout mechanism");
            break auto_logout;
        }

        if (getCurrentRefreshTokenTtlInSeconds() === undefined) {
            log?.(
                `${
                    currentTokens.hasRefreshToken
                        ? "The refresh token is opaque, we can't read it's expiration time"
                        : "No refresh token"
                }, and idleSessionLifetimeInSeconds was not set, can't implement auto logout mechanism`
            );
            break auto_logout;
        }

        const { startCountdown } = createStartCountdown({
            tickCallback: async ({ secondsLeft }) => {
                const invokeAllCallbacks = (params: { secondsLeft: number | undefined }) => {
                    const { secondsLeft } = params;
                    Array.from(autoLogoutCountdownTickCallbacks).forEach(tickCallback =>
                        tickCallback({ secondsLeft })
                    );
                };

                if (secondsLeft === 0) {
                    cancel_if_offline: {
                        const { isOnline, prOnline } = getIsOnline();

                        if (isOnline) {
                            break cancel_if_offline;
                        }

                        const didCameBackOnline = await Promise.race([
                            new Promise<false>(resolve => setTimeout(() => resolve(false), 10_000)),
                            prOnline.then(() => true)
                        ]);

                        if (didCameBackOnline) {
                            break cancel_if_offline;
                        }

                        log?.(
                            [
                                "Normally now we should auto logout.",
                                "However since the browser is currently offline",
                                "we avoid calling logout() now to play nice in case",
                                "this app is a PWA.",
                                "Next getTokens() is called logout will be called"
                            ].join(" ")
                        );

                        unsubscribeFromIsUserActive();

                        invokeAllCallbacks({ secondsLeft: undefined });

                        wouldHaveAutoLoggedOutIfBrowserWasOnline = true;

                        return;
                    }

                    await oidc_loggedIn.logout(autoLogoutParams);
                }

                invokeAllCallbacks({ secondsLeft });
            }
        });

        let stopCountdown: (() => void) | undefined = undefined;

        const evtIsUserActive = createEvtIsUserActive({
            configId,
            sessionId
        });

        const { unsubscribe: unsubscribeFromIsUserActive } = evtIsUserActive.subscribe(isUserActive => {
            if (isUserActive) {
                if (stopCountdown !== undefined) {
                    stopCountdown();
                    stopCountdown = undefined;
                }
            } else {
                assert(stopCountdown === undefined, "902992");

                const currentRefreshTokenTtlInSeconds = getCurrentRefreshTokenTtlInSeconds();

                assert(currentRefreshTokenTtlInSeconds !== undefined, "902992326");

                stopCountdown = startCountdown({
                    countDownFromSeconds: currentRefreshTokenTtlInSeconds
                }).stopCountdown;
            }
        });

        {
            const currentRefreshTokenTtlInSeconds = getCurrentRefreshTokenTtlInSeconds();

            assert(currentRefreshTokenTtlInSeconds !== undefined, "9029923253");

            log?.(
                [
                    `The user will be automatically logged out after ${toHumanReadableDuration(
                        currentRefreshTokenTtlInSeconds * 1_000
                    )} of inactivity.`,
                    idleSessionLifetimeInSeconds === undefined
                        ? undefined
                        : `It was artificially defined by using the idleSessionLifetimeInSeconds param.`
                ]
                    .filter(x => x !== undefined)
                    .join("\n")
            );
        }
    }

    return oidc_loggedIn;
}
