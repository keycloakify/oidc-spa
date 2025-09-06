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
import { assert, is, isAmong } from "../../vendor/frontend/tsafe";
import { createOidc, type Oidc, OidcInitializationError } from "../../core";
import { Deferred } from "../../tools/Deferred";
import { decodeJwt } from "../../tools/decodeJwt";
import { type KeycloakUtils, createKeycloakUtils } from "../keycloakUtils";
import { workerTimers } from "../../vendor/frontend/worker-timers";
import { type StatefulEvt, createStatefulEvt } from "../../tools/StatefulEvt";
import { readExpirationTimeInJwt } from "../../tools/readExpirationTimeInJwt";

type ConstructorParams = KeycloakServerConfig & {
    homeUrl: string;
};

type InternalState = {
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

const internalStateByInstance = new WeakMap<Keycloak, InternalState>();

/**
 * This module provides a drop-in replacement for `keycloak-js`,
 * designed for teams migrating to `oidc-spa` with minimal changes.
 *
 * ⚠️ While the import path is `oidc-spa/keycloak-js`, this is *not* a re-export or patch —
 * it is a full alternative implementation aligned with the `keycloak-js` API.
 */
export class Keycloak {
    /**
     * Creates a new Keycloak client instance.
     * @param config A configuration object or path to a JSON config file.
     */
    constructor(params: ConstructorParams) {
        const issuerUri = `${params.url.replace(/\/$/, "")}/realms/${params.realm}`;

        internalStateByInstance.set(this, {
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
        });
    }

    /**
     * Called to initialize the adapter.
     * @param initOptions Initialization options.
     * @returns A promise to set functions to be invoked on success or error.
     */
    async init(initOptions: KeycloakInitOptions = {}): Promise<boolean> {
        const { onLoad = "check-sso", redirectUri, enableLogging, scope, locale } = initOptions;

        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        if (internalState.initOptions !== undefined) {
            if (JSON.stringify(internalState.initOptions) !== JSON.stringify(initOptions)) {
                throw new Error("Can't call init() multiple time with different params");
            }
            await internalState.dInitialized.pr;
            const { oidc } = internalState;
            assert(oidc !== undefined);
            return oidc.isUserLoggedIn;
        }

        internalState.initOptions = initOptions;

        const { constructorParams, issuerUri } = internalState;

        const autoLogin = onLoad === "login-required";

        let hasCreateResolved = false;

        const oidcOrError = await createOidc({
            homeUrl: constructorParams.homeUrl,
            issuerUri,
            clientId: internalState.constructorParams.clientId,
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

        internalState.oidc = oidc;

        if (oidc.isUserLoggedIn) {
            {
                const tokens = await oidc.getTokens();

                const onNewToken = (tokens_new: Oidc.Tokens<Record<string, unknown>>) => {
                    internalState.tokens = tokens_new;
                    this.onAuthRefreshSuccess?.();
                };

                onNewToken(tokens);

                oidc.subscribeToTokensChange(onNewToken);
            }

            {
                const { $onTokenExpired } = internalState;

                let clear: (() => void) | undefined = undefined;

                $onTokenExpired.subscribe(onTokenExpired => {
                    clear?.();

                    if (onTokenExpired === undefined) {
                        return;
                    }

                    let timer: ReturnType<typeof workerTimers.setTimeout> | undefined = undefined;

                    const onNewToken = () => {
                        if (timer !== undefined) {
                            workerTimers.clearTimeout(timer);
                        }

                        const { tokens } = internalState;
                        assert(tokens !== undefined);

                        timer = workerTimers.setTimeout(() => {
                            onTokenExpired.call(this);
                        }, Math.max(tokens.accessTokenExpirationTime - Date.now() - 3_000, 0));
                    };

                    onNewToken();

                    const { unsubscribe } = oidc.subscribeToTokensChange(onNewToken);

                    clear = () => {
                        if (timer !== undefined) {
                            workerTimers.clearTimeout(timer);
                        }
                        unsubscribe();
                    };
                });
            }

            onActionUpdate_call: {
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
        }

        if (!oidc.isUserLoggedIn && oidc.initializationError !== undefined) {
            this.onAuthError?.({
                error: oidc.initializationError.name,
                error_description: oidc.initializationError.message
            });
        }

        internalState.dInitialized.resolve();

        this.onReady?.(oidc.isUserLoggedIn);
        if (oidc.isUserLoggedIn) {
            this.onAuthSuccess?.();
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

        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        const { oidc } = internalState;

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

        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        const { oidc, tokens } = internalState;

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

        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        const { oidc, tokens } = internalState;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.realAccess when keycloak.realmAccess is false is a logical error in your application"
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

        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        const { oidc, tokens } = internalState;

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
        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        if (!this.didInitialize) {
            return internalState.initOptions?.token;
        }

        const { oidc, tokens } = internalState;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.token when keycloak.token is false is a logical error in your application"
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
        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        if (!this.didInitialize) {
            const { token } = internalState.initOptions ?? {};

            if (token === undefined) {
                return undefined;
            }

            return decodeJwt(token) as KeycloakTokenParsed;
        }

        const { oidc, tokens } = internalState;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.token when keycloak.tokenParsed is false is a logical error in your application"
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
        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        if (!this.didInitialize) {
            return internalState.initOptions?.refreshToken;
        }

        const { oidc, tokens } = internalState;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.token when keycloak.refreshToken is false is a logical error in your application"
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
        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        if (!this.didInitialize) {
            const { refreshToken } = internalState.initOptions ?? {};

            if (refreshToken === undefined) {
                return undefined;
            }

            return decodeJwt(refreshToken) as KeycloakTokenParsed;
        }

        const { oidc, tokens } = internalState;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.token when keycloak.refreshTokenParsed is false is a logical error in your application"
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
        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        if (!this.didInitialize) {
            return internalState.initOptions?.idToken;
        }

        const { oidc, tokens } = internalState;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.token when keycloak.token is false is a logical error in your application"
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
        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        if (!this.didInitialize) {
            const { idToken } = internalState.initOptions ?? {};

            if (idToken === undefined) {
                return undefined;
            }

            return decodeJwt(idToken) as KeycloakTokenParsed;
        }

        const { oidc, tokens } = internalState;

        assert(oidc !== undefined);

        if (!oidc.isUserLoggedIn) {
            console.warn(
                "Trying to read keycloak.token when keycloak.refreshTokenParsed is false is a logical error in your application"
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
     *
     * NOTE oidc-spa: Not supported.
     */
    timeSkew = null;

    /**
     * Whether the instance has been initialized by calling `.init()`.
     */
    get didInitialize(): boolean {
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);
        return internalState.oidc !== undefined;
    }

    /**
     * @private Undocumented.
     */
    get loginRequired(): boolean {
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);

        const { initOptions } = internalState;

        if (initOptions === undefined) {
            return false;
        }

        return initOptions.onLoad === "login-required";
    }

    /**
     * @private Undocumented.
     */
    get authServerUrl(): string {
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);
        const {
            keycloakUtils: { issuerUriParsed }
        } = internalState;

        return `${issuerUriParsed.origin}${issuerUriParsed.kcHttpRelativePath}`;
    }

    /**
     * @private Undocumented.
     */
    get realm(): string {
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);
        const {
            keycloakUtils: { issuerUriParsed }
        } = internalState;

        return issuerUriParsed.realm;
    }

    /**
     * @private Undocumented.
     */
    get clientId(): string {
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);
        const { constructorParams } = internalState;
        return constructorParams.clientId;
    }

    /**
     * @private Undocumented.
     */
    get redirectUri(): string | undefined {
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);
        const { initOptions } = internalState;
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

        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);
        const { oidc, tokens } = internalState;

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
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);
        const { profile } = internalState;
        return profile;
    }

    /**
     * @private Undocumented.
     */
    get userInfo(): KeycloakUserInfo | undefined {
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);
        const { userInfo } = internalState;
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
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);
        const { $onTokenExpired } = internalState;
        $onTokenExpired.current = value;
    }
    get onTokenExpired() {
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);
        const { $onTokenExpired } = internalState;
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
    async login(
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

        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);

        if (!this.didInitialize) {
            await internalState.dInitialized.pr;
        }

        const { oidc, keycloakUtils } = internalState;

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
    async logout(options?: KeycloakLogoutOptions): Promise<never> {
        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        if (!this.didInitialize) {
            await internalState.dInitialized.pr;
        }

        const { oidc, initOptions } = internalState;

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
    async register(options?: KeycloakRegisterOptions): Promise<never> {
        return this.login({
            ...options,
            action: "register"
        });
    }

    /**
     * Redirects to the Account Management Console.
     */
    async accountManagement(options?: {
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
    createAccountUrl(options?: KeycloakAccountOptions & { locale?: string }): string {
        const { locale, redirectUri } = options ?? {};

        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        const { keycloakUtils } = internalState;

        return keycloakUtils.getAccountUrl({
            clientId: this.clientId,
            backToAppFromAccountUrl: redirectUri ?? location.href,
            locale
        });
    }

    /**
     * Returns true if the token has less than `minValidity` seconds left before
     * it expires.
     * @param minValidity If not specified, `0` is used.
     */
    isTokenExpired(minValidity: number = 0): boolean {
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);

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
            const { tokens } = internalState;
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
    async updateToken(minValidity: number = 5): Promise<boolean> {
        const internalState = internalStateByInstance.get(this);

        assert(internalState !== undefined);

        if (!this.didInitialize) {
            await internalState.dInitialized.pr;
        }

        const { oidc } = internalState;

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
    hasRealmRole(role: string): boolean {
        const access = this.realmAccess;
        return access !== undefined && access.roles.indexOf(role) >= 0;
    }

    /**
     * Returns true if the token has the given role for the resource.
     * @param role A role name.
     * @param resource If not specified, `clientId` is used.
     */
    hasResourceRole(role: string, resource?: string): boolean {
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
    async loadUserProfile(): Promise<KeycloakProfile> {
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);

        if (!this.didInitialize) {
            await internalState.dInitialized.pr;
        }

        const { oidc, keycloakUtils } = internalState;

        assert(oidc !== undefined);

        assert(oidc.isUserLoggedIn, "Can't load userProfile if user not authenticated");

        const { accessToken } = await oidc.getTokens();

        return (internalState.profile = await keycloakUtils.fetchUserProfile({ accessToken }));
    }

    /**
     * @private Undocumented.
     */
    async loadUserInfo(): Promise<KeycloakUserInfo> {
        const internalState = internalStateByInstance.get(this);
        assert(internalState !== undefined);

        if (!this.didInitialize) {
            await internalState.dInitialized.pr;
        }

        const { oidc, keycloakUtils } = internalState;

        assert(oidc !== undefined);

        assert(oidc.isUserLoggedIn, "Can't load userInfo if user not authenticated");

        const { accessToken } = await oidc.getTokens();

        return (internalState.userInfo = await keycloakUtils.fetchUserInfo({ accessToken }));
    }
}
