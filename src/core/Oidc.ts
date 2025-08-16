import type { OidcInitializationError } from "./OidcInitializationError";

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
            extraQueryParams?: Record<string, string | undefined>;
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
            renewTokens(params?: {
                extraTokenParams?: Record<string, string | undefined>;
            }): Promise<void>;
            /**
             * Prefer using getTokens_next(), in the next major getTokens() will be be async.
             *
             * The problem is that When the computer wakes up from sleep, the tokens might have expired so
             * there is a window of time where the tokens are not valid.
             *
             * This potential issue do not affect you if you are using "oidc-spa/react" as in the documentation.
             * */
            getTokens: () => Tokens<DecodedIdToken>;
            getTokens_next: () => Promise<Tokens<DecodedIdToken>>;
            subscribeToTokensChange: (onTokenChange: (tokens: Tokens<DecodedIdToken>) => void) => {
                unsubscribe: () => void;
            };
            getDecodedIdToken: () => DecodedIdToken;
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
            /**
             * Defined when authMethod is "back from auth server".
             * If you called `goToAuthServer` or `login` with extraQueryParams, this object let you know the outcome of the
             * of the action that was intended.
             *
             * For example, on a Keycloak server, if you called `goToAuthServer({ extraQueryParams: { kc_action: "UPDATE_PASSWORD" } })`
             * you'll get back: `{ extraQueryParams: { kc_action: "UPDATE_PASSWORD" }, result: { kc_action_status: "success" } }` (or "cancelled")
             */
            backFromAuthServer:
                | {
                      extraQueryParams: Record<string, string>;
                      result: Record<string, string>;
                  }
                | undefined;
            /**
             * This is true when the user has just returned from the login pages.
             * This is also true when the user navigate to your app and was able to be silently signed in because there was still a valid session.
             * This false however when the use just reload the page.
             *
             * This can be used to perform some action related to session initialization
             * but avoiding doing it repeatedly every time the user reload the page.
             *
             * Note that this is referring to the browser session and not the OIDC session
             * on the server side.
             *
             * If you want to perform an action only when a new OIDC session is created
             * you can test oidc.isNewBrowserSession && oidc.backFromAuthServer !== undefined
             */
            isNewBrowserSession: boolean;
        };

    export type Tokens<DecodedIdToken extends Record<string, unknown> = Record<string, unknown>> =
        | Tokens.WithRefreshToken<DecodedIdToken>
        | Tokens.WithoutRefreshToken<DecodedIdToken>;

    export namespace Tokens {
        export type Common<DecodedIdToken> = {
            accessToken: string;
            accessTokenExpirationTime: number;
            idToken: string;
            decodedIdToken: DecodedIdToken;
            /** Read from id_token's JWT, iat claim value, it's a JavaScript timestamp (millisecond epoch) */
            issuedAtTime: number;
        };

        export type WithRefreshToken<DecodedIdToken> = Common<DecodedIdToken> & {
            hasRefreshToken: true;
            refreshToken: string;
            refreshTokenExpirationTime: number | undefined;
        };

        export type WithoutRefreshToken<DecodedIdToken> = Common<DecodedIdToken> & {
            hasRefreshToken: false;
            refreshToken?: never;
            refreshTokenExpirationTime?: never;
        };
    }
}
