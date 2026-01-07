import type {
    KeycloakServerConfig,
    KeycloakInitOptions,
    KeycloakError,
    KeycloakLogoutOptions,
    KeycloakRoles,
    KeycloakTokenParsed,
    KeycloakResourceAccess,
    KeycloakProfile,
    KeycloakUserInfo,
    KeycloakLoginOptions,
    KeycloakRegisterOptions,
    KeycloakAccountOptions
} from "./types";
import { assert, is } from "../../tools/tsafe/assert";
import { isAmong } from "../../tools/tsafe/isAmong";
import { createOidc, type Oidc, OidcInitializationError } from "../../core";
import { Deferred } from "../../tools/Deferred";
import { decodeJwt } from "../../tools/decodeJwt";
import { type KeycloakUtils, createKeycloakUtils } from "../keycloakUtils";
import { type StatefulEvt, createStatefulEvt } from "../../tools/StatefulEvt";
import { readExpirationTimeInJwt } from "../../tools/readExpirationTimeInJwt";
import { getHomeAndRedirectUri } from "../../core/homeAndRedirectUri";

type ConstructorParams = KeycloakServerConfig & {
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
     */
    sessionRestorationMethod?: "iframe" | "full page redirect" | "auto";
};

/**
 * This module provides a drop-in replacement for `keycloak-js`,
 * designed for teams migrating to `oidc-spa` with minimal changes.
 *
 * While the import path is `oidc-spa/keycloak-js`, this is *not* a re-export or patch —
 * it is a full alternative implementation aligned with the `keycloak-js` API.
 */
export class Keycloak {
    readonly #state: {
        constructorParams: ConstructorParams;
        keycloakUtils: KeycloakUtils;
        issuerUri: string;
        dInitialized: Deferred<void>;
        initOptions: KeycloakInitOptions | undefined;
        oidc: Oidc<Record<string, unknown>> | undefined;
        tokens: Oidc.Tokens<Record<string, unknown>> | undefined;
        profile: KeycloakProfile | undefined;
        userInfo: KeycloakUserInfo | undefined;
        $onTokenExpired: StatefulEvt<(() => void) | undefined>;
    };

    /**
     * Creates a new Keycloak client instance.
     * @param config A configuration object or path to a JSON config file.
     *
     * NOTE oidc-spa: Currently not supporting GenericOidcConfig (providing explicitly authorization_endpoint ect)
     * But we could if with the __metadata parameter of oidc-spa.
     * I'm not seeing the usecase when ran against keycloak right now so not doing it.
     */
    constructor(params: ConstructorParams) {
        const issuerUri = `${params.url.replace(/\/$/, "")}/realms/${params.realm}`;

        this.#state = {
            constructorParams: params,
            dInitialized: new Deferred(),
            initOptions: undefined,
            oidc: undefined,
            tokens: undefined,
            keycloakUtils: createKeycloakUtils({ issuerUri }),
            issuerUri,
            profile: undefined,
            userInfo: undefined,
            $onTokenExpired: createStatefulEvt(() => undefined)
        };
    }

    /**
     * Called to initialize the adapter.
     * @param initOptions Initialization options.
     * @returns A promise to set functions to be invoked on success or error.
     */
    init = this.#init.bind(this);
    async #init(initOptions: KeycloakInitOptions = {}): Promise<boolean> {
        const { onLoad = "check-sso", redirectUri, enableLogging, scope, locale } = initOptions;

        if (this.#state.initOptions !== undefined) {
            if (JSON.stringify(this.#state.initOptions) !== JSON.stringify(initOptions)) {
                throw new Error("Can't call init() multiple time with different params");
            }
            await this.#state.dInitialized.pr;
            const { oidc } = this.#state;
            assert(oidc !== undefined);
            return oidc.isUserLoggedIn;
        }

        this.#state.initOptions = initOptions;

        const { constructorParams, issuerUri } = this.#state;

        const autoLogin = onLoad === "login-required";

        let hasCreateResolved = false;

        const oidcOrError = await createOidc({
            BASE_URL: constructorParams.BASE_URL,
            sessionRestorationMethod: constructorParams.sessionRestorationMethod,
            issuerUri,
            clientId: this.#state.constructorParams.clientId,
            autoLogin,
            postLoginRedirectUrl: redirectUri,
            debugLogs: enableLogging,
            scopes: scope?.split(" "),
            extraQueryParams:
                !autoLogin || locale === undefined
                    ? undefined
                    : () => {
                          if (hasCreateResolved) {
                              return {};
                          }

                          return {
                              ui_locales: locale
                          };
                      }
        })
            // NOTE: This can only happen when autoLogin is true, otherwise the error
            // is in oidc.initializationError
            .catch((error: OidcInitializationError) => error);

        hasCreateResolved = true;

        if (oidcOrError instanceof OidcInitializationError) {
            this.onAuthError?.({
                error: oidcOrError.name,
                error_description: oidcOrError.message
            });

            await new Promise<never>(() => {});
            assert(false);
        }

        const oidc = oidcOrError;

        if (oidc.isUserLoggedIn) {
            const tokens = await oidc.getTokens();

            const onNewToken = (tokens_new: Oidc.Tokens<Record<string, unknown>>) => {
                this.#state.tokens = tokens_new;
                this.onAuthRefreshSuccess?.();
            };

            onNewToken(tokens);

            oidc.subscribeToTokensChange(onNewToken);
        }

        this.#state.oidc = oidc;
        this.#state.dInitialized.resolve();

        this.onReady?.(oidc.isUserLoggedIn);

        onAuthSuccess_call: {
            if (!oidc.isUserLoggedIn) {
                break onAuthSuccess_call;
            }

            this.onAuthSuccess?.();
        }

        onAuthError_call: {
            if (oidc.isUserLoggedIn) {
                break onAuthError_call;
            }

            if (oidc.initializationError === undefined) {
                break onAuthError_call;
            }

            this.onAuthError?.({
                error: oidc.initializationError.name,
                error_description: oidc.initializationError.message
            });
        }

        onActionUpdate_call: {
            if (!oidc.isUserLoggedIn) {
                break onActionUpdate_call;
            }

            if (this.onActionUpdate === undefined) {
                break onActionUpdate_call;
            }

            const { backFromAuthServer } = oidc;

            if (backFromAuthServer === undefined) {
                break onActionUpdate_call;
            }

            const status = backFromAuthServer.result.kc_action_status;

            if (!isAmong(["success", "cancelled", "error"], status)) {
                break onActionUpdate_call;
            }

            const action = backFromAuthServer.extraQueryParams.kc_action;

            if (action === undefined) {
                break onActionUpdate_call;
            }

            this.onActionUpdate(status, action);
        }

        schedule_onTokenExpired_call: {
            if (!oidc.isUserLoggedIn) {
                break schedule_onTokenExpired_call;
            }

            const { $onTokenExpired } = this.#state;

            let clear: (() => void) | undefined = undefined;

            const next = (onTokenExpired: (() => void) | undefined) => {
                clear?.();

                if (onTokenExpired === undefined) {
                    return;
                }

                let timer: ReturnType<typeof setTimeout> | undefined = undefined;

                const onNewToken = () => {
                    if (timer !== undefined) {
                        clearTimeout(timer);
                    }

                    const { tokens } = this.#state;
                    assert(tokens !== undefined);

                    timer = setTimeout(() => {
                        onTokenExpired.call(this);
                    }, Math.max(tokens.accessTokenExpirationTime - tokens.getServerDateNow() - 3_000, 0));
                };

                onNewToken();

                const { unsubscribeFromTokensChange } = oidc.subscribeToTokensChange(onNewToken);

                clear = () => {
                    if (timer !== undefined) {
                        clearTimeout(timer);
                    }
                    unsubscribeFromTokensChange();
                };
            };

            next($onTokenExpired.current);

            $onTokenExpired.subscribe(next);
        }

        return oidc.isUserLoggedIn;
    }

    /**
     * Is true if the user is authenticated, false otherwise.
     */
    get authenticated(): boolean {
        if (!this.didInitialize) {
            return false;
        }

        const { oidc } = this.#state;

        assert(oidc !== undefined);

        return oidc.isUserLoggedIn;
    }

    /**
     * The user id.
     */
    get subject(): string | undefined {
        if (!this.didInitialize) {
            return undefined;
        }

        const { oidc, tokens } = this.#state;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.subject when keycloak.authenticated is false is a logical error in your application"
            );
            return undefined;
        }

        assert(tokens !== undefined);

        return tokens.decodedIdToken_original.sub;
    }

    /**
     * Response mode passed in init (default value is `'fragment'`).
     *
     * NOTE oidc-spa: Can only be fragment.
     */
    responseMode = "fragment";

    /**
     * Response type sent to Keycloak with login requests. This is determined
     * based on the flow value used during initialization, but can be overridden
     * by setting this value.
     *
     * NOTE oidc-spa: Can only be 'code'
     */
    responseType = "code";

    /**
     * Flow passed in init.
     *
     * NOTE oidc-spa: Can only be 'standard'
     */
    flow = "standard";

    /**
     * The realm roles associated with the token.
     */
    get realmAccess(): KeycloakRoles | undefined {
        if (!this.didInitialize) {
            return undefined;
        }

        const { oidc, tokens } = this.#state;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.realAccess when keycloak.authenticated is false is a logical error in your application"
            );
            return undefined;
        }

        assert(tokens !== undefined);
        assert(is<KeycloakTokenParsed>(tokens.decodedIdToken_original));

        return tokens.decodedIdToken_original.realm_access;
    }

    /**
     * The resource roles associated with the token.
     */
    get resourceAccess(): KeycloakResourceAccess | undefined {
        if (!this.didInitialize) {
            return undefined;
        }

        const { oidc, tokens } = this.#state;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.resourceAccess when keycloak.authenticated is false is a logical error in your application"
            );
            return undefined;
        }

        assert(tokens !== undefined);
        assert(is<KeycloakTokenParsed>(tokens.decodedIdToken_original));

        return tokens.decodedIdToken_original.resource_access;
    }

    /**
     * The base64 encoded token that can be sent in the Authorization header in
     * requests to services.
     */
    get token(): string | undefined {
        if (!this.didInitialize) {
            return this.#state.initOptions?.token;
        }

        const { oidc, tokens } = this.#state;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.token when keycloak.authenticated is false is a logical error in your application"
            );
            return undefined;
        }

        assert(tokens !== undefined);

        return tokens.accessToken;
    }

    /**
     * The parsed token as a JavaScript object.
     */
    get tokenParsed(): KeycloakTokenParsed | undefined {
        if (!this.didInitialize) {
            const { token } = this.#state.initOptions ?? {};

            if (token === undefined) {
                return undefined;
            }

            return decodeJwt(token) as KeycloakTokenParsed;
        }

        const { oidc, tokens } = this.#state;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.tokenParsed when keycloak.authenticated is false is a logical error in your application"
            );
            return undefined;
        }

        assert(tokens !== undefined);

        return decodeJwt(tokens.accessToken);
    }

    /**
     * The base64 encoded refresh token that can be used to retrieve a new token.
     */
    get refreshToken(): string | undefined {
        if (!this.didInitialize) {
            return this.#state.initOptions?.refreshToken;
        }

        const { oidc, tokens } = this.#state;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.refreshToken when keycloak.authenticated is false is a logical error in your application"
            );
            return undefined;
        }

        assert(tokens !== undefined);

        return tokens.refreshToken;
    }

    /**
     * The parsed refresh token as a JavaScript object.
     */
    get refreshTokenParsed(): KeycloakTokenParsed | undefined {
        if (!this.didInitialize) {
            const { refreshToken } = this.#state.initOptions ?? {};

            if (refreshToken === undefined) {
                return undefined;
            }

            return decodeJwt(refreshToken) as KeycloakTokenParsed;
        }

        const { oidc, tokens } = this.#state;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.refreshTokenParsed when keycloak.authenticated is false is a logical error in your application"
            );
            return undefined;
        }

        assert(tokens !== undefined);

        if (tokens.refreshToken === undefined) {
            return undefined;
        }

        return decodeJwt(tokens.refreshToken) as KeycloakTokenParsed;
    }

    /**
     * The base64 encoded ID token.
     */
    get idToken(): string | undefined {
        if (!this.didInitialize) {
            return this.#state.initOptions?.idToken;
        }

        const { oidc, tokens } = this.#state;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.idToken when keycloak.authenticated is false is a logical error in your application"
            );
            return undefined;
        }

        assert(tokens !== undefined);

        return tokens.idToken;
    }

    /**
     * The parsed id token as a JavaScript object.
     */
    get idTokenParsed(): KeycloakTokenParsed | undefined {
        if (!this.didInitialize) {
            const { idToken } = this.#state.initOptions ?? {};

            if (idToken === undefined) {
                return undefined;
            }

            return decodeJwt(idToken) as KeycloakTokenParsed;
        }

        const { oidc, tokens } = this.#state;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.idTokenParsed when keycloak.authenticated is false is a logical error in your application"
            );
            return undefined;
        }

        assert(tokens !== undefined);
        assert(is<KeycloakTokenParsed>(tokens.decodedIdToken_original));

        return tokens.decodedIdToken_original;
    }

    /**
     * The estimated time difference between the browser time and the Keycloak
     * server in seconds. This value is just an estimation, but is accurate
     * enough when determining if a token is expired or not.
     */
    get timeSkew(): number | null {
        if (!this.didInitialize) {
            const { timeSkew } = this.#state.initOptions ?? {};

            if (timeSkew === undefined) {
                return null;
            }

            return timeSkew;
        }

        const { oidc, tokens } = this.#state;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.timeSkew when keycloak.authenticated is false is a logical error in your application"
            );
            return null;
        }

        assert(tokens !== undefined);

        return Math.ceil((tokens.getServerDateNow() - Date.now()) / 1000);
    }

    /**
     * Whether the instance has been initialized by calling `.init()`.
     */
    get didInitialize(): boolean {
        return this.#state.oidc !== undefined;
    }

    /**
     * @private Undocumented.
     */
    get loginRequired(): boolean {
        const { initOptions } = this.#state;

        if (initOptions === undefined) {
            return false;
        }

        return initOptions.onLoad === "login-required";
    }

    /**
     * @private Undocumented.
     */
    get authServerUrl(): string {
        const {
            keycloakUtils: { issuerUriParsed }
        } = this.#state;

        return `${issuerUriParsed.origin}${issuerUriParsed.kcHttpRelativePath}`;
    }

    /**
     * @private Undocumented.
     */
    get realm(): string {
        const {
            keycloakUtils: { issuerUriParsed }
        } = this.#state;

        return issuerUriParsed.realm;
    }

    /**
     * @private Undocumented.
     */
    get clientId(): string {
        const { constructorParams } = this.#state;
        return constructorParams.clientId;
    }

    /**
     * @private Undocumented.
     */
    get redirectUri(): string | undefined {
        const { initOptions } = this.#state;
        if (initOptions === undefined) {
            return undefined;
        }
        return initOptions.redirectUri;
    }

    /**
     * @private Undocumented.
     */
    get sessionId(): string | undefined {
        if (!this.didInitialize) {
            return undefined;
        }

        const { oidc, tokens } = this.#state;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.sessionId when keycloak.authenticated is false is a logical error in your application"
            );
            return undefined;
        }

        assert(tokens !== undefined);

        const { sid } = tokens.decodedIdToken_original;

        assert(typeof sid === "string");

        return sid;
    }

    /**
     * @private Undocumented.
     */
    get profile(): KeycloakProfile | undefined {
        const { profile } = this.#state;
        return profile;
    }

    /**
     * @private Undocumented.
     */
    get userInfo(): KeycloakUserInfo | undefined {
        const { userInfo } = this.#state;
        return userInfo;
    }

    /**
     * Called when the adapter is initialized.
     */
    onReady?(authenticated: boolean): void;

    /**
     * Called when a user is successfully authenticated.
     */
    onAuthSuccess?(): void;

    /**
     * Called if there was an error during authentication.
     */
    onAuthError?(errorData: KeycloakError): void;

    /**
     * Called when the token is refreshed.
     */
    onAuthRefreshSuccess?(): void;

    /**
     * Called if there was an error while trying to refresh the token.
     *
     * NOTE oidc-spa: In oidc-spa an auth refresh error always triggers a page refresh.
     */
    //onAuthRefreshError?(): void;

    /**
     * Called if the user is logged out (will only be called if the session
     * status iframe is enabled, or in Cordova mode).
     *
     * NOTE oidc-spa: In oidc-spa a logout always triggers a page refresh.
     */
    //onAuthLogout?(): void;

    /**
     * Called when the access token is expired. If a refresh token is available
     * the token can be refreshed with Keycloak#updateToken, or in cases where
     * it's not (ie. with implicit flow) you can redirect to login screen to
     * obtain a new access token.
     */
    set onTokenExpired(value: (() => void) | undefined) {
        const { $onTokenExpired } = this.#state;
        $onTokenExpired.current = value;
    }
    get onTokenExpired() {
        const { $onTokenExpired } = this.#state;
        return $onTokenExpired.current;
    }

    /**
     * Called when a AIA has been requested by the application.
     * @param status the outcome of the required action
     * @param action the alias name of the required action, e.g. UPDATE_PASSWORD, CONFIGURE_TOTP etc.
     */
    onActionUpdate?(status: "success" | "cancelled" | "error", action?: string): void;

    /**
     * Redirects to login form.
     * @param options Login options.
     */
    login = this.#login.bind(this);
    async #login(
        options?: KeycloakLoginOptions & { doesCurrentHrefRequiresAuth?: boolean }
    ): Promise<never> {
        const {
            redirectUri,
            action,
            loginHint,
            acr,
            acrValues,
            idpHint,
            locale,
            doesCurrentHrefRequiresAuth
        } = options ?? {};

        if (!this.didInitialize) {
            await this.#state.dInitialized.pr;
        }

        const { oidc, keycloakUtils } = this.#state;

        assert(oidc !== undefined);

        const extraQueryParams_commons: Record<string, string | undefined> = {
            claims:
                acr === undefined
                    ? undefined
                    : JSON.stringify({
                          id_token: {
                              acr
                          }
                      }),
            acr_values: acrValues,
            ui_locales: locale
        };

        if (oidc.isUserLoggedIn) {
            assert(action !== "register");
            assert(loginHint === undefined);
            assert(idpHint === undefined);
            assert(doesCurrentHrefRequiresAuth === undefined);

            await oidc.goToAuthServer({
                redirectUrl: redirectUri,
                extraQueryParams: {
                    ...extraQueryParams_commons,
                    kc_action: action,
                    ui_locales: locale
                }
            });
            assert(false);
        }

        assert(action === undefined || action === "register");

        await oidc.login({
            redirectUrl: redirectUri,
            doesCurrentHrefRequiresAuth: doesCurrentHrefRequiresAuth ?? false,
            extraQueryParams: {
                ...extraQueryParams_commons,
                login_hint: loginHint,
                kc_idp_hint: idpHint
            },
            transformUrlBeforeRedirect:
                action !== "register" ? undefined : keycloakUtils.transformUrlBeforeRedirectForRegister
        });
        assert(false);
    }

    /**
     * Redirects to logout.
     * @param options Logout options.
     */
    logout = this.#logout.bind(this);
    async #logout(options?: KeycloakLogoutOptions): Promise<never> {
        if (!this.didInitialize) {
            await this.#state.dInitialized.pr;
        }

        const { oidc, initOptions } = this.#state;

        assert(oidc !== undefined);
        assert(initOptions !== undefined);

        assert(oidc.isUserLoggedIn, "The user is not currently logged in");

        const redirectUri = options?.redirectUri ?? initOptions.redirectUri;

        await oidc.logout({
            ...(redirectUri === undefined
                ? { redirectTo: "current page" }
                : { redirectTo: "specific url", url: redirectUri })
        });
        assert(false);
    }

    /**
     * Redirects to registration form.
     * @param options The options used for the registration.
     */
    register = this.#register.bind(this);
    async #register(options?: KeycloakRegisterOptions): Promise<never> {
        return this.login({
            ...options,
            action: "register"
        });
    }

    /**
     * Redirects to the Account Management Console.
     */
    accountManagement = this.#accountManagement.bind(this);
    async #accountManagement(options?: {
        /**
         * Specifies the uri to redirect to when redirecting back to the application.
         */
        redirectUri?: string;
        locale?: string;
    }): Promise<never> {
        const { redirectUri, locale } = options ?? {};

        window.location.href = this.createAccountUrl({
            redirectUri,
            locale
        });
        return new Promise<never>(() => {});
    }

    /**
     * Returns the URL to login form.
     * @param options Supports same options as Keycloak#login.
     *
     * NOTE oidc-spa: Not supported, please use login() method.
     */
    //createLoginUrl(options?: KeycloakLoginOptions): Promise<string>;

    /**
     * Returns the URL to logout the user.
     * @param options Logout options.
     *
     * NOTE oidc-spa: Not supported, please use logout() method.
     */
    //createLogoutUrl(options?: KeycloakLogoutOptions): string;

    /**
     * Returns the URL to registration page.
     * @param options The options used for creating the registration URL.
     *
     * NOTE oidc-spa: Not supported please user login({ action: "register" })
     */
    //createRegisterUrl(options?: KeycloakRegisterOptions): Promise<string>;

    /**
     * Returns the URL to the Account Management Console.
     * @param options The options used for creating the account URL.
     */
    createAccountUrl = this.#createAccountUrl.bind(this);
    #createAccountUrl(options?: KeycloakAccountOptions & { locale?: string }): string {
        const { locale, redirectUri } = options ?? {};

        const { keycloakUtils, constructorParams } = this.#state;

        return keycloakUtils.getAccountUrl({
            clientId: this.clientId,
            validRedirectUri: (() => {
                if (redirectUri !== undefined) {
                    return redirectUri;
                }

                const { homeUrlAndRedirectUri } = getHomeAndRedirectUri({
                    BASE_URL_params: constructorParams.BASE_URL
                });

                return homeUrlAndRedirectUri;
            })(),
            locale
        });
    }

    /**
     * Returns true if the token has less than `minValidity` seconds left before
     * it expires.
     * @param minValidity If not specified, `0` is used.
     */
    isTokenExpired = this.#isTokenExpired.bind(this);
    #isTokenExpired(minValidity: number = 0): boolean {
        let accessTokenExpirationTime: number;

        if (!this.didInitialize) {
            const fakeAccessToken = this.token;
            if (fakeAccessToken === undefined) {
                throw new Error("isTokenExpired was called too early");
            }

            const time = readExpirationTimeInJwt(fakeAccessToken);

            assert(time !== undefined, "The initial token is not a JWT");

            accessTokenExpirationTime = time;
        } else {
            const { tokens } = this.#state;
            assert(tokens !== undefined);

            accessTokenExpirationTime = tokens.accessTokenExpirationTime;
        }

        if (accessTokenExpirationTime > Date.now() + minValidity * 1_000) {
            return false;
        }

        return true;
    }

    /**
     * If the token expires within `minValidity` seconds, the token is refreshed.
     * If the session status iframe is enabled, the session status is also
     * checked.
     * @param minValidity If not specified, `5` is used.
     * @returns A promise to set functions that can be invoked if the token is
     *          still valid, or if the token is no longer valid.
     * @example
     * ```js
     * keycloak.updateToken(5).then(function(refreshed) {
     *   if (refreshed) {
     *     alert('Token was successfully refreshed');
     *   } else {
     *     alert('Token is still valid');
     *   }
     * }).catch(function() {
     *   alert('Failed to refresh the token, or the session has expired');
     * });
     */
    updateToken = this.#updateToken.bind(this);
    async #updateToken(minValidity: number = 5): Promise<boolean> {
        if (!this.didInitialize) {
            await this.#state.dInitialized.pr;
        }

        const { oidc } = this.#state;

        assert(oidc !== undefined);

        assert(oidc.isUserLoggedIn, "updateToken called too early");

        if (!this.isTokenExpired(minValidity)) {
            return false;
        }

        await oidc.renewTokens();

        return true;
    }

    /**
     * Clears authentication state, including tokens. This can be useful if
     * the application has detected the session was expired, for example if
     * updating token fails. Invoking this results in Keycloak#onAuthLogout
     * callback listener being invoked.
     *
     * NOTE oidc-spa: In this implementation we never end up in the kind of
     * state where calling this makes sense.
     * oidc-spa take more control and exposes less complexity to the user of the
     * adapter.
     */
    //clearToken(): void;

    /**
     * Returns true if the token has the given realm role.
     * @param role A realm role name.
     */
    hasRealmRole = this.#hasRealmRole.bind(this);
    #hasRealmRole(role: string): boolean {
        const access = this.realmAccess;
        return access !== undefined && access.roles.indexOf(role) >= 0;
    }

    /**
     * Returns true if the token has the given role for the resource.
     * @param role A role name.
     * @param resource If not specified, `clientId` is used.
     */
    hasResourceRole = this.#hasResourceRole.bind(this);
    #hasResourceRole(role: string, resource?: string): boolean {
        if (this.resourceAccess === undefined) {
            return false;
        }

        const access = this.resourceAccess[resource || this.clientId];
        return access !== undefined && access.roles.indexOf(role) >= 0;
    }

    /**
     * Loads the user's profile.
     * @returns A promise to set functions to be invoked on success or error.
     */
    loadUserProfile = this.#loadUserProfile.bind(this);
    async #loadUserProfile(): Promise<KeycloakProfile> {
        if (!this.didInitialize) {
            await this.#state.dInitialized.pr;
        }

        const { oidc, keycloakUtils } = this.#state;

        assert(oidc !== undefined);

        assert(oidc.isUserLoggedIn, "Can't load userProfile if user not authenticated");

        const { accessToken } = await oidc.getTokens();

        return (this.#state.profile = await keycloakUtils.fetchUserProfile({ accessToken }));
    }

    /**
     * @private Undocumented.
     */
    loadUserInfo = this.#loadUserInfo.bind(this);
    async #loadUserInfo(): Promise<KeycloakUserInfo> {
        if (!this.didInitialize) {
            await this.#state.dInitialized.pr;
        }

        const { oidc, keycloakUtils } = this.#state;

        assert(oidc !== undefined);

        assert(oidc.isUserLoggedIn, "Can't load userInfo if user not authenticated");

        const { accessToken } = await oidc.getTokens();

        return (this.#state.userInfo = await keycloakUtils.fetchUserInfo({ accessToken }));
    }

    /** Get the underlying oidc-spa instance */
    get oidc(): Oidc<Record<string, unknown>> {
        assert(
            this.didInitialize,
            "Cannot get keycloak.oidc before the init() method was called and have resolved."
        );

        const { oidc } = this.#state;

        assert(oidc !== undefined);

        return oidc;
    }
}
