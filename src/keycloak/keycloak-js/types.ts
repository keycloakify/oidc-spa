/*
 * MIT License
 *
 * Copyright 2017 Brett Epps <https://github.com/eppsilon>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
 * following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
 * LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
 * NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
export type KeycloakOnLoad = "login-required" | "check-sso";
export type KeycloakResponseMode = "query" | "fragment";
export type KeycloakResponseType = "code" | "id_token token" | "code id_token token";
export type KeycloakFlow = "standard" | "implicit" | "hybrid";
export type KeycloakPkceMethod = "S256" | false;

export interface KeycloakServerConfig {
    /**
     * URL to the Keycloak server, for example: http://keycloak-server/auth
     */
    url: string;
    /**
     * Name of the realm, for example: 'myrealm'
     */
    realm: string;
    /**
     * Client identifier, example: 'myapp'
     */
    clientId: string;
}

/**
 * OpenIdProviderMetadata The OpenID version of the adapter configuration, based on the {@link https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata OpenID Connect Discovery specification}.
 */
export interface OpenIdProviderMetadata {
    /** URL of the OP's OAuth 2.0 Authorization Endpoint. */
    authorization_endpoint: string;
    /** URL of the OP's OAuth 2.0 Token Endpoint. */
    token_endpoint: string;
    /** URL of the OP's UserInfo Endpoint. */
    userinfo_endpoint?: string;
    /**  URL of an OP iframe that supports cross-origin communications for session state information with the RP Client, using the HTML5 postMessage API. */
    check_session_iframe?: string;
    /** URL at the OP to which an RP can perform a redirect to request that the End-User be logged out at the OP. */
    end_session_endpoint?: string;
}

export interface Acr {
    /**
     * Array of values, which will be used inside ID Token `acr` claim sent inside the `claims` parameter to Keycloak server during login.
     * Values should correspond to the ACR levels defined in the ACR to Loa mapping for realm or client or to the numbers (levels) inside defined
     * Keycloak authentication flow. See section 5.5.1 of OIDC 1.0 specification for the details.
     */
    values: string[];
    /**
     * This parameter specifies if ACR claims is considered essential or not.
     */
    essential: boolean;
}

export interface KeycloakInitOptions {
    /**
     * Adds a [cryptographic nonce](https://en.wikipedia.org/wiki/Cryptographic_nonce)
     * to verify that the authentication response matches the request.
     * @default true
     *
     * NOTE oidc-spa: Not supported because redundant with PKCE and we only support PKCE.
     */
    //useNonce?: boolean;
    useNonce?: false;

    /**
     *
     * Allow usage of different types of adapters or a custom adapter to make Keycloak work in different environments.
     *
     * The following options are supported:
     * - `default` - Use default APIs that are available in browsers.
     * - `cordova` - Use a WebView in Cordova.
     * - `cordova-native` - Use Cordova native APIs, this is recommended over `cordova`.
     *
     * It's also possible to pass in a custom adapter for the environment you are running Keycloak in. In order to do so extend the `KeycloakAdapter` interface and implement the methods that are defined there.
     *
     * For example:
     *
     * ```ts
     * // Implement the 'KeycloakAdapter' interface so that all required methods are guaranteed to be present.
     * const MyCustomAdapter: KeycloakAdapter = {
     * 	login(options) {
     * 		// Write your own implementation here.
     * 	}
     *
     * 	// The other methods go here...
     * };
     *
     * keycloak.init({
     * 	adapter: MyCustomAdapter,
     * });
     * ```
     *
     * NOTE oidc-spa: We do not support adapters
     *
     */
    //adapter?: 'default' | 'cordova' | 'cordova-native' | KeycloakAdapter;
    adapter?: "default";

    /**
     * Specifies an action to do on load.
     *
     * NOTE oidc-spa: Default "check-sso"
     */
    onLoad?: KeycloakOnLoad;

    /**
     * Set an initial value for the token.
     */
    token?: string;

    /**
     * Set an initial value for the refresh token.
     */
    refreshToken?: string;

    /**
     * Set an initial value for the id token (only together with `token` or
     * `refreshToken`).
     */
    idToken?: string;

    /**
     * Set an initial value for skew between local time and Keycloak server in
     * seconds (only together with `token` or `refreshToken`).
     */
    timeSkew?: number;

    /**
     * Set to enable/disable monitoring login state.
     * @default true (in keycloak-js but false in oidc-spa)
     *
     * NOTE oidc-spa: we check session via broadcast channels.
     */
    //checkLoginIframe?: boolean;
    checkLoginIframe?: false;

    /**
     * Set the interval to check login state (in seconds).
     * @default 5
     *
     * NOTE oidc-spa: Not applicable
     */
    //checkLoginIframeInterval?: number;
    checkLoginIframeInterval?: undefined;

    /**
     * Set the OpenID Connect response mode to send to Keycloak upon login.
     * @default fragment After successful authentication Keycloak will redirect
     *                   to JavaScript application with OpenID Connect parameters
     *                   added in URL fragment. This is generally safer and
     *                   recommended over query.
     *
     * NOTE oidc-spa: We enforce 'fragment' against keycloak
     */
    //responseMode?: KeycloakResponseMode;
    responseMode?: "fragment";

    /**
     * Specifies a default uri to redirect to after login or logout.
     * This is currently supported for adapter 'cordova-native' and 'default'
     */
    redirectUri?: string;

    /**
     * Specifies an uri to redirect to after silent check-sso.
     * Silent check-sso will only happen, when this redirect uri is given and
     * the specified uri is available within the application.
     *
     * NOTE oidc-spa: Not applicable, we use the root as silentSsoRedirectUri
     */
    // silentCheckSsoRedirectUri?: string;

    /**
     * Specifies whether the silent check-sso should fallback to "non-silent"
     * check-sso when 3rd party cookies are blocked by the browser. Defaults
     * to true.
     *
     * NOTE oidc-spa: We enforce true.
     */
    //silentCheckSsoFallback?: boolean;
    silentCheckSsoFallback?: true;

    /**
     * Set the OpenID Connect flow.
     * @default standard
     *
     * NOTE oidc-spa: Only standard flow supported, only safe flow for SPAs
     */
    //flow?: KeycloakFlow;
    flow?: "standard";

    /**
     * Configures the Proof Key for Code Exchange (PKCE) method to use. This will default to 'S256'.
     * Can be disabled by passing `false`.
     *
     * NOTE oidc-spa: PKCE can't be disabled, we enforce the use of S256.
     */
    //pkceMethod?: KeycloakPkceMethod;
    pkceMethod?: "S256";

    /**
     * Enables logging messages from Keycloak to the console.
     * @default false
     */
    enableLogging?: boolean;

    /**
     * Set the default scope parameter to the login endpoint. Use a space-delimited list of scopes.
     * Note that the scope 'openid' will be always be added to the list of scopes by the adapter.
     * Note that the default scope specified here is overwritten if the `login()` options specify scope explicitly.
     */
    scope?: string;

    /**
     * Configures how long will Keycloak adapter wait for receiving messages from server in ms. This is used,
     * for example, when waiting for response of 3rd party cookies check.
     *
     * @default 10000
     *
     * NOTE oidc-spa: Computed dynamically depending of the connection speed, at least 7 seconds in production.
     */
    //messageReceiveTimeout?: number
    messageReceiveTimeout?: undefined;

    /**
     * When onLoad is 'login-required', sets the 'ui_locales' query param in compliance with section 3.1.2.1
     * of the OIDC 1.0 specification.
     */
    locale?: string;

    /**
     * HTTP method for calling the end_session endpoint. Defaults to 'GET'.
     *
     * NOTE oidc-spa: only 'GET' supported.
     */
    //logoutMethod?: 'GET' | 'POST';
    logoutMethod?: "GET";

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
}

export interface KeycloakLoginOptions {
    /**
     * Specifies the scope parameter for the login url
     * The scope 'openid' will be added to the scope if it is missing or undefined.
     *
     * NOTE oidc-spa: The scopes can be provided only at the init() level.
     * If it's a problem for you please open an issue on https://github.com/keycloakify/oidc-spa
     */
    //scope?: string;
    scope?: undefined;

    /**
     * Specifies the uri to redirect to after login.
     *
     * NOTE oidc-spa: In this implementation the redirectUri is not actually
     * the parameter that will be specified to keycloak as redirect_uri,
     * functionally however it's the same for you, this is where the user will
     * be redirected after login.
     */
    redirectUri?: string;

    /**
     * By default the login screen is displayed if the user is not logged into
     * Keycloak. To only authenticate to the application if the user is already
     * logged in and not display the login page if the user is not logged in, set
     * this option to `'none'`. To always require re-authentication and ignore
     * SSO, set this option to `'login'`. To always prompt the user for consent,
     * set this option to `'consent'`. This ensures that consent is requested,
     * even if it has been given previously.
     *
     * NOTE oidc-spa: This feature is not supported, as we believe it
     * exposes too much complexity to the user. oidc-spa manages this internally.
     * While this approach offers less fine-grained control, the defaults are
     * sensible and designed to spare you from dealing with protocol intricacies.
     * If you feel otherwise, we welcome discussion—please open an issue at https://github.com/keycloakify/oidc-spa.
     */
    //prompt?: "none" | "login" | "consent";
    prompt?: undefined;

    /**
     * If value is `'register'` then user is redirected to registration page,
     * otherwise to login page.
     */
    action?: string;

    /**
     * Used just if user is already authenticated. Specifies maximum time since
     * the authentication of user happened. If user is already authenticated for
     * longer time than `'maxAge'`, the SSO is ignored and he will need to
     * authenticate again.
     *
     * NOTE oidc-spa: Not supported as we think this are policies that should
     * be defined and enforced on the server using "Idle Session Lifetime" and not
     * hard coded in the client.
     */
    //maxAge?: number;
    maxAge?: undefined;

    /**
     * Used to pre-fill the username/email field on the login form.
     */
    loginHint?: string;

    /**
     * Sets the `acr` claim of the ID token sent inside the `claims` parameter. See section 5.5.1 of the OIDC 1.0 specification.
     */
    acr?: Acr;

    /**
     * Configures the 'acr_values' query param in compliance with section 3.1.2.1
     * of the OIDC 1.0 specification.
     * Used to tell Keycloak what level of authentication the user needs.
     */
    acrValues?: string;

    /**
     * Used to tell Keycloak which IDP the user wants to authenticate with.
     */
    idpHint?: string;

    /**
     * Sets the 'ui_locales' query param in compliance with section 3.1.2.1
     * of the OIDC 1.0 specification.
     */
    locale?: string;

    /**
     * Specifies arguments that are passed to the Cordova in-app-browser (if applicable).
     * Options 'hidden' and 'location' are not affected by these arguments.
     * All available options are defined at https://cordova.apache.org/docs/en/latest/reference/cordova-plugin-inappbrowser/.
     * Example of use: { zoom: "no", hardwareback: "yes" }
     *
     * NOTE oidc-spa: Not supported.
     */
    //cordovaOptions?: { [optionName: string]: string };
    cordovaOptions?: undefined;
}

export interface KeycloakLogoutOptions {
    /**
     * Specifies the uri to redirect to after logout.
     */
    redirectUri?: string;

    /**
     * HTTP method for calling the end_session endpoint. Defaults to 'GET'.
     *
     * NOTE oidc-spa: Only 'GET' supported.
     */
    //logoutMethod?: 'GET' | 'POST';
    logoutMethod?: "GET";
}

export interface KeycloakRegisterOptions extends Omit<KeycloakLoginOptions, "action"> {}

export interface KeycloakAccountOptions {
    /**
     * Specifies the uri to redirect to when redirecting back to the application.
     */
    redirectUri?: string;
}
export interface KeycloakError {
    error: string;
    error_description: string;
}

export interface KeycloakRedirectUriOptions {
    /**
     * Specifies the uri to redirect to after login.
     */
    redirectUri?: string;
}

export interface KeycloakAdapter {
    login(options?: KeycloakLoginOptions): Promise<void>;
    logout(options?: KeycloakLogoutOptions): Promise<void>;
    register(options?: KeycloakRegisterOptions): Promise<void>;
    accountManagement(): Promise<void>;
    redirectUri(options?: KeycloakRedirectUriOptions): string;
}

export interface KeycloakProfile {
    id?: string;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    enabled?: boolean;
    emailVerified?: boolean;
    totp?: boolean;
    createdTimestamp?: number;
    attributes?: Record<string, unknown>;
}

export interface KeycloakTokenParsed {
    iss?: string;
    sub?: string;
    aud?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    nonce?: string;
    acr?: string;
    amr?: string;
    azp?: string;
    session_state?: string;
    realm_access?: KeycloakRoles;
    resource_access?: KeycloakResourceAccess;
    [key: string]: any; // Add other attributes here.
}

export interface KeycloakResourceAccess {
    [key: string]: KeycloakRoles;
}

export interface KeycloakRoles {
    roles: string[];
}

export interface KeycloakUserInfo {
    sub: string;
    [key: string]: any;
}
