import {
    UserManager as OidcClientTsUserManager,
    WebStorageStateStore,
    type User as OidcClientTsUser,
    InMemoryWebStorage
} from "../vendor/frontend/oidc-client-ts";
import { type OidcMetadata, fetchOidcMetadata } from "./OidcMetadata";
import { assert, type Equals } from "../tools/tsafe/assert";
import { id } from "../tools/tsafe/id";
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
import { createOidcClientTsUserToTokens } from "./oidcClientTsUserToTokens";
import { createLoginSilent } from "./loginSilent";
import { authResponseToUrl, type AuthResponse } from "./AuthResponse";
import { getPersistedAuthState, persistAuthState } from "./persistedAuthState";
import type { Oidc } from "./Oidc";
import { createEvt } from "../tools/Evt";
import { getHaveSharedParentDomain } from "../tools/haveSharedParentDomain";
import {
    createLoginOrGoToAuthServer,
    getPrSafelyRestoredFromBfCacheAfterLoginBackNavigationOrInitializationError
} from "./loginOrGoToAuthServer";
import { createLazySessionStorage } from "../tools/lazySessionStorage";
import {
    startLoginOrRefreshProcess,
    waitForAllOtherOngoingLoginOrRefreshProcessesToComplete
} from "./ongoingLoginOrRefreshProcesses";
import { createGetIsNewBrowserSession } from "./isNewBrowserSession";
import { getIsOnline } from "../tools/getIsOnline";
import { isKeycloak } from "../keycloak/isKeycloak";
import { INFINITY_TIME } from "../tools/INFINITY_TIME";
import { getRootRelativeOriginalLocationHref_earlyInit } from "./earlyInit_rootRelativeOriginalLocationHref";
import { getIsLikelyDevServer } from "../tools/isLikelyDevServer";
import { createObjectThatThrowsIfAccessed } from "../tools/createObjectThatThrowsIfAccessed";
import {
    evtIsThereMoreThanOneInstanceThatCantUserIframes,
    notifyNewInstanceThatCantUseIframes
} from "./instancesThatCantUseIframes";
import { getDesiredPostLoginRedirectUrl } from "./desiredPostLoginRedirectUrl";
import { getHomeAndRedirectUri } from "./homeAndRedirectUri";
import { ensureNonBlankPaint } from "../tools/ensureNonBlankPaint";
import {
    setStateDataCookieIfEnabled,
    clearStateDataCookie,
    getIsStateDataCookieEnabled
} from "./StateDataCookie";
import {
    loadWebcryptoLinerShim,
    hasLoadWebcryptoLinerShimBeenCalled
} from "../tools/loadWebcryptoLinerShim";
import type { Evt } from "../tools/Evt";
import type { ParamsOfCreateGetServerDateNow } from "../tools/getServerDateNow";
import type { MaybeAsync } from "../tools/MaybeAsync";

// NOTE: Replaced at build time
const VERSION = "{{OIDC_SPA_VERSION}}";

export type ParamsOfCreateOidc<
    DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_OidcCoreSpec,
    AutoLogin extends boolean = false,
    User = never
> = {
    createUser?: (params: {
        decodedIdToken: Oidc.Tokens.DecodedIdToken_OidcCoreSpec;
        accessToken: string;
        fetchUserInfo: () => Promise<{
            [key: string]: unknown;
            sub: string;
        }>;
        issuerUri: string;
    }) => MaybeAsync<User>;

    /**
     * See: https://docs.oidc-spa.dev/v/v10/providers-configuration/provider-configuration
     */
    issuerUri: string;
    /**
     * See: https://docs.oidc-spa.dev/v/v10/providers-configuration/provider-configuration
     */
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

    decodedIdTokenSchema?: {
        parse: (decodedIdToken_original: Oidc.Tokens.DecodedIdToken_OidcCoreSpec) => DecodedIdToken;
    };

    /**
     * This parameter defines after how many seconds of inactivity the user should be
     * logged out automatically.
     *
     * WARNING: It should be configured on the identity server side
     * as it's the authoritative source for security policies and not the client.
     * If you don't provide this parameter it will be inferred from the refresh token expiration time.
     * Some provider however don't issue a refresh token or do not correctly set the
     * expiration time. This parameter enable you to hard code the value to compensate
     * the shortcoming of your auth server.
     * */
    idleSessionLifetimeInSeconds?: number;

    /**
     * Extra optional parameter specific to oidc-spa
     * (not present in the original keycloak-js module)
     *
     * Where to redirect when auto logout happens due to session expiration
     * on the Keycloak server.
     *
     * Example:
     * autoLogoutParams: { redirectTo: "current page" } // Default
     * autoLogoutParams: { redirectTo: "home" }
     * autoLogoutParams: { redirectTo: "specific url", url: "/your-session-has-expired" }
     * autoLogoutParams: {
     *      redirectTo: "specific url",
     *      get url(){ return `/your-session-has-expired?return_url=${encodeURIComponent(location.href)}`; }
     * }
     */
    autoLogoutParams?:
        | {
              redirectTo: "home" | "current page";
          }
        | {
              redirectTo: "specific url";
              url: string;
          };

    autoLogin?: AutoLogin;

    /**
     * NOTE: Can be provided as parameter to the Vite plugin or to oidcEarlyInit()
     *
     * Determines how session restoration is handled.
     * Session restoration allows users to stay logged in between visits
     * without needing to explicitly sign in each time.
     *
     * Options:
     *
     * - **"auto" (default)**:
     *   Automatically selects the best method.
     *   If the app’s domain shares a common parent domain with the authorization endpoint,
     *   an iframe is used for silent session restoration.
     *   Otherwise, a full-page redirect is used.
     *
     * - **"full page redirect"**:
     *   Forces full-page reloads for session restoration.
     *   Use this if your application is served with a restrictive CSP
     *   (e.g., `Content-Security-Policy: frame-ancestors "none"`)
     *   or `X-Frame-Options: DENY`, and you cannot modify those headers.
     *   This mode provides a slightly less seamless UX and will lead oidc-spa to
     *   store tokens in `localStorage` if multiple OIDC clients are used
     *   (e.g., your app communicates with several APIs).
     *
     * - **"iframe"**:
     *   Forces iframe-based session restoration.
     *   In development, if you go in your browser setting and allow your auth server’s domain
     *   to set third-party cookies this value will let you test your app
     *   with the local dev server as it will behave in production.
     *
     *  See: https://docs.oidc-spa.dev/v/v10/resources/third-party-cookies-and-session-restoration
     */
    sessionRestorationMethod?: "iframe" | "full page redirect" | "auto";

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

    /**
     * NOTE: This parameter is optional if you use the Vite plugin.
     *
     * This parameter let's you overwrite the value provided in
     * oidcEarlyInit({ BASE_URL: xxx });
     *
     * What should you put in this parameter?
     *   - Vite project:             `BASE_URL: import.meta.env.BASE_URL`
     *   - Create React App project: `BASE_URL: process.env.PUBLIC_URL`
     *   - Other:                    `BASE_URL: "/"` (Usually, or `/dashboard` if your app is not at the root of the domain)
     */
    BASE_URL?: string;

    /**
     * This parameter is irrelevant in most usecases.
     * It tells where to redirect after a successful login or autoLogin.
     *
     * If you are not in autoLogin mode there is absolutely no reason to use
     * this parameter since you can pass `login({ redirectUrl: "..." })`.
     *
     * It can only be useful in some edge case with `autoLogin: true`
     * When you want to precisely redirect somewhere after login.
     *
     * This can make sense if you have multiple clients to talk with different
     * API and no iframe capabilities.
     */
    postLoginRedirectUrl?: string;

    /**
     * This is only for opting out of DPoP for a specific OIDC client instance.
     * To enable DPoP see: https://docs.oidc-spa.dev/v/v10/security-features/dpop
     * */
    disableDPoP?: true;
};

const globalContext = {
    prOidcByConfigId: new Map<string, Promise<Oidc<any>>>(),
    hasLogoutBeenCalled: id<boolean>(false),
    dExports_earlyInit: new Deferred<Exports_earlyInit>(),
    dExports_tokenSubstitution: new Deferred<Exports_tokenSubstitution>(),
    dExports_DPoP: new Deferred<Exports_DPoP>()
};

export type Exports_earlyInit =
    | { shouldLoadApp: false }
    | {
          shouldLoadApp: true;

          getEvtIframeAuthResponse: () => Evt<AuthResponse>;
          getRedirectAuthResponse: () =>
              | { authResponse: AuthResponse; clearAuthResponse: () => void }
              | { authResponse: undefined; clearAuthResponse?: never };

          sessionRestorationMethod: "iframe" | "full page redirect" | "auto" | undefined;
      };

export function registerExports_earlyInit(exports: Exports_earlyInit): void {
    globalContext.dExports_earlyInit.resolve(exports);
}

export type Exports_tokenSubstitution = {
    getTokensPlaceholders: (params: {
        configId: string;
        tokens: Exports_tokenSubstitution.Tokens;
    }) => Exports_tokenSubstitution.Tokens;
};

export namespace Exports_tokenSubstitution {
    export type Tokens = {
        accessToken: string;
        idToken: string;
        refreshToken?: string;
    };
}

export function registerExports_tokenSubstitution(exports: Exports_tokenSubstitution): void {
    globalContext.dExports_tokenSubstitution.resolve(exports);
}

export type Exports_DPoP = {
    isEnforced: boolean;
    createDPoPStore: (params: {
        implementation: "indexedDB" | "in memory";
        configId: string;
        clientId: string;
    }) => Exports_DPoP.DPoPStore;
    registerAccessTokenForDPoP: (params: {
        configId: string;
        accessToken: string;
        paramsOfCreateGetServerDateNow: ParamsOfCreateGetServerDateNow;
    }) => void;
};

export namespace Exports_DPoP {
    export type DPoPState = {
        keys: CryptoKeyPair;
        nonce?: string;
    };

    export type DPoPStore = {
        set: (key: string, value: DPoPState) => Promise<void>;
        get: (key: string) => Promise<DPoPState>;
        remove: (key: string) => Promise<DPoPState>;
        getAllKeys: () => Promise<string[]>;
    };
}

export function registerExports_DPoP(exports: Exports_DPoP): void {
    globalContext.dExports_DPoP.resolve(exports);
}

/** @see: https://docs.oidc-spa.dev/v/v10/usage */
export async function createOidc<
    DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_OidcCoreSpec,
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

    const { issuerUri: issuerUri_params, clientId, debugLogs, ...rest } = params;

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
    params: Omit<ParamsOfCreateOidc<DecodedIdToken, AutoLogin>, "issuerUri" | "clientId" | "debugLogs">,
    preProcessedParams: {
        issuerUri: string;
        clientId: string;
        configId: string;
        log: typeof console.log | undefined;
    }
): Promise<AutoLogin extends true ? Oidc.LoggedIn<DecodedIdToken> : Oidc<DecodedIdToken>> {
    const {
        transformUrlBeforeRedirect,
        extraQueryParams: extraQueryParamsOrGetter,
        extraTokenParams: extraTokenParamsOrGetter,
        decodedIdTokenSchema,
        idleSessionLifetimeInSeconds,
        autoLogoutParams = { redirectTo: "current page" },
        autoLogin = false,
        postLoginRedirectUrl: postLoginRedirectUrl_default,
        __unsafe_clientSecret,
        __unsafe_useIdTokenAsAccessToken = false,
        __metadata,
        disableDPoP: disableDPoP_params = false,
        sessionRestorationMethod: sessionRestorationMethod_params,
        BASE_URL: BASE_URL_params,
        createUser
    } = params;

    const exports_earlyInit = await (async () => {
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

        const exports_earlyInit = await globalContext.dExports_earlyInit.pr;

        window.clearTimeout(timer);

        return exports_earlyInit;
    })();

    if (!exports_earlyInit.shouldLoadApp) {
        return new Promise<never>(() => {});
    }

    const {
        getEvtIframeAuthResponse,
        getRedirectAuthResponse,
        sessionRestorationMethod: sessionRestorationMethod_earlyInit
    } = exports_earlyInit;

    const sessionRestorationMethod =
        sessionRestorationMethod_params ?? sessionRestorationMethod_earlyInit ?? "auto";

    const { value: exports_tokenSubstitution } = globalContext.dExports_tokenSubstitution.getState();

    const { value: exports_DPoP } = globalContext.dExports_DPoP.getState();

    const scopes = Array.from(new Set(["openid", ...(params.scopes ?? ["profile"])]));

    const { issuerUri, clientId, configId, log } = preProcessedParams;

    if (window.crypto.subtle === undefined) {
        log?.("window.crypto.subtle not present, lazily loading polyfills.");
        await loadWebcryptoLinerShim();
    }

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

    const { homeUrlAndRedirectUri } = getHomeAndRedirectUri({ BASE_URL_params });

    log?.(
        `Calling createOidc v${VERSION} ${JSON.stringify(
            {
                issuerUri,
                clientId,
                scopes,
                validRedirectUri: homeUrlAndRedirectUri
            },
            null,
            2
        )}`
    );

    if (exports_tokenSubstitution !== undefined) {
        log?.(
            [
                "Token substitution successfully enabled.",
                "",
                "→ Tokens exposed to the application layer are unusable for resource server calls.",
                "→ They remain structurally valid JWTs, but their signature segment is replaced.",
                "→ Before any request leaves the app (fetch, XHR, WebSocket, beacon),",
                "   the real tokens are restored inside a fully hardened, sandboxed interceptor.",
                "",
                "This means that even with an XSS vulnerability or a compromised dependency,",
                "an attacker cannot extract valid tokens, unless they have also compromised",
                "your application's build pipeline."
            ].join("\n")
        );
    }

    const stateUrlParamValue_instance = generateStateUrlParamValue();

    const oidcMetadata = __metadata ?? (await fetchOidcMetadata({ issuerUri }));

    const shouldEnableDPoP = (() => {
        if (disableDPoP_params) {
            log?.("DPoP explicitly disabled for this instance");
            return false;
        }

        if (exports_DPoP === undefined) {
            log?.("DPoP disabled, to enable it see: https://docs.oidc-spa.dev/features/dpop");
            return false;
        }

        if (__unsafe_useIdTokenAsAccessToken) {
            if (exports_DPoP.isEnforced) {
                throw new Error(
                    [
                        "oidc-spa: Cannot enable DPoP when",
                        "__unsafe_useIdTokenAsAccessToken is set to true"
                    ].join(" ")
                );
            }
            log?.("DPoP Disabled due to __unsafe_useIdTokenAsAccessToken: true");
            return false;
        }

        if (oidcMetadata === undefined) {
            return false;
        }

        const isSupported = (() => {
            const { dpop_signing_alg_values_supported } = oidcMetadata;

            if (dpop_signing_alg_values_supported === undefined) {
                return false;
            }

            return dpop_signing_alg_values_supported.includes("ES256");
        })();

        if (!isSupported) {
            if (exports_DPoP.isEnforced) {
                throw new Error("oidc-spa: The IdP does not support DPoP");
            }

            log?.("DPoP disabled because it's not supported by the IdP");
        } else {
            log?.("DPoP enabled");
        }

        return isSupported;
    })();

    const canUseIframe = (() => {
        switch (sessionRestorationMethod) {
            case "auto":
                break;
            case "full page redirect":
                return false;
            case "iframe":
                return true;
            default:
                assert<Equals<typeof sessionRestorationMethod, never>>;
        }

        third_party_cookies: {
            if (oidcMetadata === undefined) {
                return false;
            }

            const { authorization_endpoint } = oidcMetadata;

            assert(
                authorization_endpoint !== undefined,
                "Missing authorization_endpoint on the provided __metadata"
            );

            const isOidcServerThirdPartyRelativeToApp = !getHaveSharedParentDomain({
                url1: window.location.origin,
                // TODO: No, here we should test against the authorization endpoint!
                url2: authorization_endpoint
            });

            if (!isOidcServerThirdPartyRelativeToApp) {
                break third_party_cookies;
            }

            const isLikelyDevServer = getIsLikelyDevServer();

            const domain_auth = new URL(authorization_endpoint).origin.split("//")[1];

            assert(domain_auth !== undefined, "33921384");

            const domain_here = window.location.origin.split("//")[1];

            let isWellKnownProviderDomain = false;
            let isIp = false;

            const suggestedDeployments = (() => {
                if (/^(?:\d{1,3}\.){3}\d{1,3}$|^\[?[A-Fa-f0-9:]+\]?$/.test(domain_auth)) {
                    isIp = true;
                    return [];
                }

                const baseDomain = (() => {
                    const segments = domain_auth.split(".");

                    if (segments.length >= 3) {
                        segments.shift();
                    }
                    return segments.join(".");
                })();

                {
                    const baseDomain_low = baseDomain.toLowerCase();

                    if (
                        baseDomain_low.includes("auth0") ||
                        baseDomain_low.includes("clerk") ||
                        baseDomain_low.includes("microsoft") ||
                        baseDomain_low.includes("okta") ||
                        baseDomain_low.includes("aws")
                    ) {
                        isWellKnownProviderDomain = true;
                        return [];
                    }
                }

                const baseUrl = new URL(homeUrlAndRedirectUri).pathname;

                return [
                    `myapp.${baseDomain}`,
                    baseDomain === domain_auth ? undefined : baseDomain,
                    `${baseDomain}/${baseUrl === "/" ? "dashboard" : baseUrl}`
                ].filter(x => x !== undefined);
            })();

            if (isLikelyDevServer) {
                log?.(
                    [
                        "Detected localhost environment.",
                        "\nWhen reloading while logged in, you will briefly see",
                        "some URL params appear in the address bar.",
                        "\nThis happens because session restore via iframe is disabled,",
                        "the browser treats your auth server as a third party.",
                        `\nAuth server: ${domain_auth}`,
                        `\nApp domain:  ${domain_here}`,
                        ...(() => {
                            if (isIp) {
                                return [];
                            }

                            if (isWellKnownProviderDomain) {
                                return [
                                    "\nYou seem to be using a well-known auth provider.",
                                    "Check your provider's docs, some allow configuring",
                                    `a your custom domain at least for the authorization endpoint.`,
                                    "\nIf configured, oidc-spa will restore sessions silently",
                                    "and improve the user experience."
                                ];
                            }

                            return [
                                "\nOnce deployed under the same root domain as your auth server,",
                                "oidc-spa will use iframes to restore sessions silently.",
                                "\nSuggested deployments:",
                                ...suggestedDeployments.map(d => `\n  • ${d}`)
                            ];
                        })(),
                        "\n\nMore info:",
                        "https://docs.oidc-spa.dev/v/v10/resources/third-party-cookies-and-session-restoration"
                    ].join(" ")
                );
            } else {
                log?.(
                    [
                        "Silent session restore via iframe is disabled.",
                        `\nAuth server: ${domain_auth}`,
                        `App domain:  ${domain_here}`,
                        "\nThey do not share a common root domain.",
                        ...(() => {
                            if (isIp) {
                                return [];
                            }

                            if (isWellKnownProviderDomain) {
                                return [
                                    "\nYou seem to be using a well-known auth provider.",
                                    "Check if you can configure a custom auth domain.",
                                    "\nIf so, oidc-spa can restore sessions silently",
                                    "and improve the user experience."
                                ];
                            }

                            return [
                                "\nTo improve the experience, here are some examples of deployment for your app:",
                                ...suggestedDeployments.map(d => `\n  • ${d}`)
                            ];
                        })(),
                        "\nMore info:",
                        "https://docs.oidc-spa.dev/v/v10/resources/third-party-cookies-and-session-restoration"
                    ].join(" ")
                );
            }

            return false;
        }

        return true;
    })();

    if (!canUseIframe) {
        notifyNewInstanceThatCantUseIframes();

        if (evtIsThereMoreThanOneInstanceThatCantUserIframes.current) {
            log?.(
                [
                    "More than one oidc instance can't use iframe",
                    "falling back to persisting tokens in session storage"
                ].join(" ")
            );
        }
    }

    const oidcClientTsUserManager =
        oidcMetadata === undefined
            ? createObjectThatThrowsIfAccessed<OidcClientTsUserManager>({
                  debugMessage: "oidc-spa: Wrong assertion 43943"
              })
            : new OidcClientTsUserManager({
                  stateUrlParamValue: stateUrlParamValue_instance,
                  authority: issuerUri,
                  client_id: clientId,
                  redirect_uri: homeUrlAndRedirectUri,
                  silent_redirect_uri: homeUrlAndRedirectUri,
                  post_logout_redirect_uri: homeUrlAndRedirectUri,
                  response_mode:
                      isKeycloak({ issuerUri }) && !getIsStateDataCookieEnabled() ? "fragment" : "query",
                  response_type: "code",
                  scope: scopes.join(" "),
                  userStore: new WebStorageStateStore({
                      store: (() => {
                          if (canUseIframe) {
                              return new InMemoryWebStorage();
                          }

                          const storage = createLazySessionStorage({ storageId: configId });

                          if (evtIsThereMoreThanOneInstanceThatCantUserIframes.current) {
                              storage.persistCurrentStateAndSubsequentChanges();
                          } else {
                              evtIsThereMoreThanOneInstanceThatCantUserIframes.subscribe(() => {
                                  storage.persistCurrentStateAndSubsequentChanges();
                              });
                          }

                          return storage;
                      })()
                  }),
                  stateStore: new WebStorageStateStore({
                      store: localStorage,
                      prefix: STATE_STORE_KEY_PREFIX
                  }),
                  client_secret: __unsafe_clientSecret,
                  metadata: oidcMetadata,
                  dpop: (() => {
                      if (!shouldEnableDPoP) {
                          return undefined;
                      }

                      assert(exports_DPoP !== undefined, "49240");

                      return {
                          store: exports_DPoP.createDPoPStore({
                              implementation: hasLoadWebcryptoLinerShimBeenCalled()
                                  ? "in memory"
                                  : "indexedDB",
                              configId,
                              clientId
                          })
                      };
                  })()
              });

    const evtInitializationOutcomeUserNotLoggedIn = createEvt<void>();

    const { loginOrGoToAuthServer } = createLoginOrGoToAuthServer({
        configId,
        oidcClientTsUserManager,
        transformUrlBeforeRedirect,
        getExtraQueryParams,
        getExtraTokenParams,
        homeUrl: homeUrlAndRedirectUri,
        stateUrlParamValue_instance,
        evtInitializationOutcomeUserNotLoggedIn,
        log
    });

    const { loginSilent } = createLoginSilent({
        getEvtIframeAuthResponse,
        oidcClientTsUserManager,
        stateUrlParamValue_instance,
        configId,
        transformUrlBeforeRedirect,
        getExtraQueryParams,
        getExtraTokenParams,
        autoLogin,
        log
    });

    const { getIsNewBrowserSession } = createGetIsNewBrowserSession({
        configId,
        evtInitializationOutcomeUserNotLoggedIn
    });

    const { completeLoginOrRefreshProcess } = await startLoginOrRefreshProcess();

    const resultOfLoginProcess = await (async (): Promise<
        | undefined // User is currently not logged in
        | Error // Initialization error
        | {
              oidcClientTsUser: OidcClientTsUser;
              backFromAuthServer: Oidc.LoggedIn["backFromAuthServer"]; // Undefined is silent signin
              isRestoredFromSessionStorage: boolean;
          }
    > => {
        if (oidcMetadata === undefined) {
            return (
                await import("./diagnostic")
            ).createWellKnownOidcConfigurationEndpointUnreachableInitializationError({
                issuerUri
            });
        }

        restore_from_session_storage: {
            if (canUseIframe) {
                break restore_from_session_storage;
            }

            if (!evtIsThereMoreThanOneInstanceThatCantUserIframes.current) {
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

            log?.("Session was restored from session storage");

            return {
                oidcClientTsUser,
                backFromAuthServer: undefined,
                isRestoredFromSessionStorage: true
            };
        }

        handle_redirect_auth_response: {
            let stateDataAndAuthResponse:
                | { stateData: StateData.Redirect; authResponse: AuthResponse }
                | undefined = undefined;

            {
                const { authResponse, clearAuthResponse } = getRedirectAuthResponse();

                if (authResponse === undefined) {
                    break handle_redirect_auth_response;
                }

                const stateData = getStateData({ stateUrlParamValue: authResponse.state });

                if (stateData === undefined) {
                    clearAuthResponse();
                    break handle_redirect_auth_response;
                }

                if (stateData.configId !== configId) {
                    break handle_redirect_auth_response;
                }

                assert(stateData.context === "redirect", "3229492");

                clearAuthResponse();

                stateDataAndAuthResponse = { stateData, authResponse };
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
                                {
                                    ...authResponse,
                                    ...(authResponse.code === undefined
                                        ? undefined
                                        : {
                                              code: authResponse.code.slice(0, 20) + "..."
                                          })
                                },
                                null,
                                2
                            )}`
                        );

                        const authResponseUrl = authResponseToUrl(authResponse);

                        clearStateDataCookie({ stateUrlParamValue: authResponse.state });

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
                                        [
                                            `The auth server responded with: ${authResponse_error},`,
                                            `trying to restore session as if we didn't had a auth response.`
                                        ].join(" ")
                                    );
                                    break handle_redirect_auth_response;
                                }
                            }

                            return error;
                        }

                        notifyOtherTabsOfLogin({ configId });

                        return {
                            oidcClientTsUser,
                            isRestoredFromSessionStorage: false,
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

        silent_login_if_possible_and_auto_login: {
            const persistedAuthState = getPersistedAuthState({ configId });

            if (persistedAuthState === "explicitly logged out" && !autoLogin) {
                log?.("Skipping session restoration completely, the user is explicitly logged out.");
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
                    log?.(
                        "Skipping session restoration via iframe (silent signin), the user is explicitly logged out."
                    );
                    break actual_silent_signin;
                }

                if (!canUseIframe) {
                    log?.("Skipping session restoration via iframe (can't use iframe)");
                    break actual_silent_signin;
                }

                log?.("Performing session restoration via iframe (silent signin)");

                const result_loginSilent = await loginSilent({
                    extraTokenParams: undefined
                });

                assert(result_loginSilent.outcome !== "token refreshed using refresh token", "876995");

                if (result_loginSilent.outcome === "timeout") {
                    const { authorization_endpoint } = oidcMetadata;

                    assert(authorization_endpoint !== undefined, "39447394");

                    return (await import("./diagnostic")).createIframeTimeoutInitializationError({
                        redirectUri: homeUrlAndRedirectUri,
                        clientId,
                        issuerUri,
                        authorizationEndpointUrl: authorization_endpoint
                    });
                }

                assert<Equals<typeof result_loginSilent.outcome, "got auth response from iframe">>();

                const { authResponse } = result_loginSilent;

                log?.(
                    `Silent signin auth response ${JSON.stringify(
                        {
                            ...authResponse,
                            ...(authResponse.code === undefined
                                ? undefined
                                : {
                                      code: authResponse.code.slice(0, 20) + "..."
                                  })
                        },
                        null,
                        2
                    )}`
                );

                clearStateDataCookie({ stateUrlParamValue: authResponse.state });

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
                    log?.("Performing session restoration (or autoLogin) with full page redirect");

                    completeLoginOrRefreshProcess();

                    if (autoLogin && persistedAuthState !== "logged in") {
                        evtInitializationOutcomeUserNotLoggedIn.post();
                    }

                    ensureNonBlankPaint();

                    await waitForAllOtherOngoingLoginOrRefreshProcessesToComplete({
                        prUnlock:
                            getPrSafelyRestoredFromBfCacheAfterLoginBackNavigationOrInitializationError()
                    });

                    await loginOrGoToAuthServer({
                        action: "login",
                        doForceReloadOnBfCache: true,
                        redirectUrl: (() => {
                            if (postLoginRedirectUrl_default) {
                                return postLoginRedirectUrl_default;
                            }

                            if (!evtIsThereMoreThanOneInstanceThatCantUserIframes.current) {
                                return getRootRelativeOriginalLocationHref_earlyInit();
                            }

                            return getDesiredPostLoginRedirectUrl() ?? window.location.href;
                        })(),
                        doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack: true,
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
                        })(),
                        preRedirectHook: () => {
                            persistAuthState({ configId, state: undefined });
                        }
                    });
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

            log?.("Successful session restoration via iframe (silent signin)");

            return {
                oidcClientTsUser,
                backFromAuthServer: undefined,
                isRestoredFromSessionStorage: false
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
        issuerUri,
        clientId,
        validRedirectUri: homeUrlAndRedirectUri
    };

    not_loggedIn_case: {
        if (!(resultOfLoginProcess instanceof Error) && resultOfLoginProcess !== undefined) {
            break not_loggedIn_case;
        }

        evtInitializationOutcomeUserNotLoggedIn.post();

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
                        doesCurrentHrefRequiresAuth = false,
                        extraQueryParams,
                        redirectUrl,
                        transformUrlBeforeRedirect
                    } = {}) => {
                        await waitForAllOtherOngoingLoginOrRefreshProcessesToComplete({
                            prUnlock:
                                getPrSafelyRestoredFromBfCacheAfterLoginBackNavigationOrInitializationError()
                        });

                        if (!canUseIframe) {
                            log?.(
                                [
                                    "IMPORTANT DEBUG INFO:",
                                    "\nWe are about to redirect to your Identity Provider (IdP).",
                                    "\nIf you see an 'Invalid Redirect URI' error on the IdP page, make sure you've added:",
                                    `\n${homeUrlAndRedirectUri}`,
                                    "\nto the list of valid redirect URIs in your IdP configuration.",
                                    "\nIf you see a 'Client not found' error make sure you've created the flowing OIDC client:",
                                    `\n${clientId}`
                                ].join(" ")
                            );
                        }

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
                                    : "directly redirect if active session show login otherwise",
                            preRedirectHook: undefined
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

    assert(oidcMetadata !== undefined, "30483403");

    const { oidcClientTsUserToTokens } = createOidcClientTsUserToTokens({
        configId,
        decodedIdTokenSchema,
        __unsafe_useIdTokenAsAccessToken,
        exports_DPoP: shouldEnableDPoP ? exports_DPoP : undefined,
        exports_tokenSubstitution,
        log
    });

    let currentTokens = oidcClientTsUserToTokens({
        oidcClientTsUser: resultOfLoginProcess.oidcClientTsUser,
        decodedIdToken_previous: undefined
    });

    detect_useless_idleSessionLifetimeInSeconds: {
        if (idleSessionLifetimeInSeconds === undefined) {
            break detect_useless_idleSessionLifetimeInSeconds;
        }

        if (currentTokens.refreshTokenExpirationTime === undefined) {
            break detect_useless_idleSessionLifetimeInSeconds;
        }

        console.warn(
            [
                "oidc-spa: You've specified idleSessionLifetimeInSeconds,",
                "but your auth server issues a refresh_token with a known expiration time.",
                "idleSessionLifetimeInSeconds should only be used as a fallback",
                "for auth servers that don't specify when an inactive session expires.",
                "The auth server, not your code, is the source of truth.",
                "See: https://docs.oidc-spa.dev/v/v10/auto-logout"
            ].join(" ")
        );
    }

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
                    serverDateNow: currentTokens.getServerDateNow(),
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

            if (!oidcMetadata.end_session_endpoint) {
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

                return new Promise<never>(() => {});
            }

            log?.(
                [
                    "IMPORTANT DEBUG INFO:",
                    "\nWe are about to redirect to your Identity Provider (IdP).",
                    "\nIf you see an 'Invalid Redirect URI' error on the IdP page, make sure you've added:",
                    `\n${homeUrlAndRedirectUri}`,
                    "\nto the list of valid post logout redirect URIs in your IdP configuration."
                ].join(" ")
            );

            window.addEventListener("pageshow", event => {
                if (!event.persisted) {
                    return;
                }
                location.reload();
            });

            setStateDataCookieIfEnabled({
                homeUrl: homeUrlAndRedirectUri,
                stateUrlParamValue_instance,
                stateDataCookie: {
                    action: "logout",
                    rootRelativeRedirectUrl: rootRelativePostLogoutRedirectUrl
                }
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
                assert(false, `signoutRedirect() is not expected to throw but it did: ${String(error)}`);
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

                    await loginOrGoToAuthServer({
                        action: "login",
                        redirectUrl: window.location.href,
                        doForceReloadOnBfCache: true,
                        extraQueryParams_local: undefined,
                        transformUrlBeforeRedirect_local: undefined,
                        doNavigateBackToLastPublicUrlIfTheTheUserNavigateBack: true,
                        interaction: "directly redirect if active session show login otherwise",
                        preRedirectHook: undefined
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
                    extraTokenParams
                });

                if (result_loginSilent.outcome === "timeout") {
                    log?.(
                        [
                            `Silent refresh of the token failed the iframe didn't post a response (timeout).`,
                            `This isn't recoverable, reloading the page.`
                        ].join(" ")
                    );
                    window.location.reload();
                    await new Promise<never>(() => {});
                    assert(false);
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

                            clearStateDataCookie({ stateUrlParamValue: authResponse.state });

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
                    decodedIdToken_previous: currentTokens.decodedIdToken
                });

                if (getPersistedAuthState({ configId }) !== undefined) {
                    persistAuthState({
                        configId,
                        state: {
                            stateDescription: "logged in",
                            refreshTokenExpirationTime: currentTokens.refreshTokenExpirationTime,
                            serverDateNow: currentTokens.getServerDateNow(),
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

            const unsubscribeFromTokensChange = () => {
                onTokenChanges.delete(onTokenChange);
            };

            return {
                unsubscribe: unsubscribeFromTokensChange,
                unsubscribeFromTokensChange
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
        })(),
        getUser: async () => {
            if (createUser === undefined) {
                throw new Error("oidc-spa: createUser wasn't provided");
            }

            return {
                user: null as any,
                subscribeToUserChange: onUserChange => {
                    return {
                        unsubscribeFromUserChange: () => {}
                    };
                },
                refreshUser: () => {}
            };
        }
    });

    if (resultOfLoginProcess.isRestoredFromSessionStorage) {
        const { isOnline, prOnline } = getIsOnline();
        if (isOnline) {
            await oidc_loggedIn.getTokens();
        } else {
            prOnline.then(() => oidc_loggedIn.getTokens());
        }
    }

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

        const CHECK_DELAY_MS = 5_000;
        const DRIFT_THRESHOLD_MS = 1_000;

        // NOTE: performance.now() is monotonic and not subject to system clock changes,
        // so the difference between Date.now() and performance.now() lets us detect
        // local clock adjustments even if timers are throttled in background tabs.
        const getClockOffset = () => Date.now() - performance.now();

        let referenceClockOffset = getClockOffset();
        let timer: ReturnType<typeof setTimeout> | undefined = undefined;

        const scheduleCheck = () => {
            timer = setTimeout(() => {
                const currentClockOffset = getClockOffset();

                if (Math.abs(currentClockOffset - referenceClockOffset) > DRIFT_THRESHOLD_MS) {
                    log?.("Renewing token now as local time might have shifted");
                    oidc_loggedIn.renewTokens();
                    return;
                }

                referenceClockOffset = currentClockOffset;
                scheduleCheck();
            }, CHECK_DELAY_MS);
        };

        scheduleCheck();

        const { unsubscribeFromTokensChange } = oidc_loggedIn.subscribeToTokensChange(() => {
            if (timer !== undefined) {
                clearTimeout(timer);
            }
            unsubscribeFromTokensChange();
            renewOnLocalTimeShift();
        });
    })();

    (function scheduleTokenRefreshToKeepSessionAlive() {
        if (!currentTokens.hasRefreshToken && !canUseIframe) {
            log?.(
                [
                    "Session keep-alive disabled: no refresh token and no iframe support. ",
                    "Result: once tokens expire, continuing requires full reload."
                ].join(" ")
            );
            return;
        }

        const msBeforeExpiration_idleSessionLifetimeInSeconds =
            idleSessionLifetimeInSeconds === undefined ? undefined : idleSessionLifetimeInSeconds * 1000;

        const msBeforeExpiration_refreshToken =
            currentTokens.refreshTokenExpirationTime === undefined
                ? undefined
                : currentTokens.refreshTokenExpirationTime - currentTokens.getServerDateNow();
        const msBeforeExpiration_accessToken =
            currentTokens.accessTokenExpirationTime - currentTokens.getServerDateNow();

        let isRefreshTokenNeverExpiring = false;

        if (
            currentTokens.refreshTokenExpirationTime !== undefined &&
            currentTokens.refreshTokenExpirationTime >= INFINITY_TIME
        ) {
            const warningLines: string[] = [];

            if (scopes.includes("offline_access")) {
                warningLines.push("offline_access scope was explicitly requested.");
            } else if (isKeycloak({ issuerUri })) {
                warningLines.push("Keycloak likely enabled offline_access by default.");
            }

            if (warningLines.length > 0) {
                warningLines.push(
                    ...[
                        "Misconfiguration: offline_access is for native apps, not for web apps like yours. ",
                        "You lose SSO and users must log in after every reload."
                    ]
                );
                console.warn(`oidc-spa: ${warningLines.join(" ")}`);
                return;
            }

            isRefreshTokenNeverExpiring = true;
        }

        const RENEW_MS_BEFORE_EXPIRES = 30_000;
        const MIN_ACCEPTABLE_MS_BEFORE_EXPIRATION = RENEW_MS_BEFORE_EXPIRES + 15_000;

        detect_session_reached_max_life: {
            if (msBeforeExpiration_refreshToken === undefined) {
                break detect_session_reached_max_life;
            }

            if (msBeforeExpiration_refreshToken > MIN_ACCEPTABLE_MS_BEFORE_EXPIRATION) {
                break detect_session_reached_max_life;
            }

            console.warn(
                [
                    "oidc-spa: The session is nearing its maximum lifetime, and the user will soon need to log in again,",
                    `or you've configured a refresh_token with a TTL of ${toHumanReadableDuration(
                        msBeforeExpiration_refreshToken
                    )}.`,
                    `If it's the latter, the TTL is too short, it must be at least ${toHumanReadableDuration(
                        MIN_ACCEPTABLE_MS_BEFORE_EXPIRATION
                    )} for reliable operation.`,
                    "Shorter lifetimes can cause unpredictable session expirations and are usually a misconfiguration.",
                    "\nIn either case, oidc-spa will not ping the auth server to keep the session alive."
                ].join(" ")
            );

            return;
        }

        let msBeforeExpiration = (() => {
            if (msBeforeExpiration_refreshToken !== undefined && !isRefreshTokenNeverExpiring) {
                log?.(
                    [
                        toHumanReadableDuration(msBeforeExpiration_refreshToken),
                        `before expiration of the refresh_token.`,
                        `Scheduling renewal of the tokens ${toHumanReadableDuration(
                            RENEW_MS_BEFORE_EXPIRES
                        )} before expiration as a way to keep the session alive on the OIDC server.`
                    ].join(" ")
                );

                return msBeforeExpiration_refreshToken;
            }

            if (msBeforeExpiration_idleSessionLifetimeInSeconds !== undefined) {
                if (
                    msBeforeExpiration_idleSessionLifetimeInSeconds < MIN_ACCEPTABLE_MS_BEFORE_EXPIRATION
                ) {
                    throw new Error(
                        [
                            `oidc-spa: The configured idleSessionLifetimeInSeconds (${toHumanReadableDuration(
                                msBeforeExpiration_idleSessionLifetimeInSeconds
                            )}) is too short.`,
                            `For reliability, it must be at least ${toHumanReadableDuration(
                                MIN_ACCEPTABLE_MS_BEFORE_EXPIRATION
                            )}.`,
                            "Very short session idle lifetimes are usually a misconfiguration, even for ultra sensitive apps."
                        ].join(" ")
                    );
                }

                log?.(
                    [
                        `You've set idleSessionLifetimeInSeconds to ${toHumanReadableDuration(
                            msBeforeExpiration_idleSessionLifetimeInSeconds
                        )}.`,
                        `This means the user session will expire after ${toHumanReadableDuration(
                            msBeforeExpiration_idleSessionLifetimeInSeconds
                        )} of inactivity (assuming you're right).`,
                        `Scheduling token renewal ${toHumanReadableDuration(
                            RENEW_MS_BEFORE_EXPIRES
                        )} before expiration to keep the session active on the OIDC server.`
                    ].join(" ")
                );

                return msBeforeExpiration_idleSessionLifetimeInSeconds;
            }

            const msBeforeExpiration =
                msBeforeExpiration_accessToken > MIN_ACCEPTABLE_MS_BEFORE_EXPIRATION
                    ? msBeforeExpiration_accessToken
                    : 3_600_000;

            log?.(
                [
                    "The auth server's idle session timeout is unknown.",
                    isRefreshTokenNeverExpiring && "(The refresh token never expires)",
                    `Assuming a default idle session TTL of ${toHumanReadableDuration(
                        msBeforeExpiration
                    )}.`,
                    `Scheduling token renewal ${toHumanReadableDuration(
                        RENEW_MS_BEFORE_EXPIRES
                    )} before expiration to keep the session active on the OIDC server.`
                ]
                    .filter(line => typeof line === "string")
                    .join(" ")
            );

            return msBeforeExpiration;
        })();

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
                    `Renewing the tokens now as otherwise the session will be terminated by the auth server in ${toHumanReadableDuration(
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

        const { unsubscribeFromTokensChange } = oidc_loggedIn.subscribeToTokensChange(() => {
            clearTimeout(timer);
            unsubscribeFromTokensChange();
            scheduleTokenRefreshToKeepSessionAlive();
        });
    })();

    auto_logout: {
        const getCurrentRefreshTokenTtlInSeconds = () => {
            if (currentTokens.refreshTokenExpirationTime === undefined) {
                return idleSessionLifetimeInSeconds;
            }

            if (currentTokens.refreshTokenExpirationTime >= INFINITY_TIME) {
                return idleSessionLifetimeInSeconds ?? 0;
            }

            const ttlInSeconds =
                (currentTokens.refreshTokenExpirationTime - currentTokens.issuedAtTime) / 1000;

            if (idleSessionLifetimeInSeconds !== undefined) {
                return Math.min(idleSessionLifetimeInSeconds, ttlInSeconds);
            }

            return ttlInSeconds;
        };

        if (getCurrentRefreshTokenTtlInSeconds() === 0) {
            log?.("The refresh_token never expires, disabling auto logout mechanism.");
            break auto_logout;
        }

        if (getCurrentRefreshTokenTtlInSeconds() === undefined) {
            log?.(
                `${
                    currentTokens.hasRefreshToken
                        ? "The refresh token is opaque, we can't read it's expiration time"
                        : "No refresh token"
                }, and idleSessionLifetimeInSeconds was not set, can't implement auto logout mechanism.`
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

        const { unsubscribe: unsubscribeFromIsUserActive } = evtIsUserActive.subscribe(eventData => {
            if (eventData.isUserActive) {
                if (stopCountdown !== undefined) {
                    stopCountdown();
                    stopCountdown = undefined;
                }
            } else {
                assert(stopCountdown === undefined, "902992");

                const currentRefreshTokenTtlInSeconds = getCurrentRefreshTokenTtlInSeconds();

                assert(currentRefreshTokenTtlInSeconds !== undefined, "902992326");

                stopCountdown = startCountdown({
                    countDownFromSeconds: Math.floor(
                        (currentRefreshTokenTtlInSeconds * 1_000 -
                            eventData.hasBeenInactiveForHowLongMs) /
                            1_000
                    )
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
