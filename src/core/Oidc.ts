import type { OidcInitializationError } from "./OidcInitializationError";

export declare type Oidc<
    DecodedIdToken extends Record<string, unknown> = Oidc.Tokens.DecodedIdToken_OidcCoreSpec,
    User = never
> = Oidc.LoggedIn<DecodedIdToken, User> | Oidc.NotLoggedIn;

export declare namespace Oidc {
    export type Common = {
        issuerUri: string;
        clientId: string;
        validRedirectUri: string;
    };

    export type NotLoggedIn = Common & {
        isUserLoggedIn: false;
        login: (params?: {
            doesCurrentHrefRequiresAuth?: boolean;
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

    export type LoggedIn<
        DecodedIdToken extends Record<string, unknown> = Record<string, unknown>,
        User = never
    > = Common & {
        isUserLoggedIn: true;
        renewTokens(params?: { extraTokenParams?: Record<string, string | undefined> }): Promise<void>;
        getTokens: () => Promise<Tokens<DecodedIdToken>>;
        subscribeToTokensChange: (onTokenChange: (tokens: Tokens<DecodedIdToken>) => void) => {
            unsubscribeFromTokensChange: () => void;
        };
        getDecodedIdToken: () => DecodedIdToken;
        logout: (
            params: { redirectTo: "home" | "current page" } | { redirectTo: "specific url"; url: string }
        ) => Promise<never>;
        goToAuthServer: (params: {
            extraQueryParams?: Record<string, string | undefined>;
            redirectUrl?: string;
            transformUrlBeforeRedirect?: (url: string) => string;
        }) => Promise<never>;
        subscribeToAutoLogoutCountdown: (
            tickCallback: (params: { secondsLeft: number | undefined }) => void
        ) => { unsubscribeFromAutoLogoutCountdown: () => void };
        /**
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

        getUser: () => Promise<{
            user: User;
            subscribeToUserChange: (
                onUserChange: (params: { user: User; user_previous: User | undefined }) => void
            ) => {
                unsubscribeFromUserChange: () => void;
            };
            refreshUser: () => Promise<User>;
        }>;
    };

    export type Tokens<
        DecodedIdToken extends Record<string, unknown> = Tokens.DecodedIdToken_OidcCoreSpec
    > = Tokens.WithRefreshToken<DecodedIdToken> | Tokens.WithoutRefreshToken<DecodedIdToken>;

    export namespace Tokens {
        export type Common<DecodedIdToken> = {
            accessToken: string;
            /** Millisecond epoch in the server's time */
            accessTokenExpirationTime: number;
            idToken: string;
            decodedIdToken: DecodedIdToken;
            /**
             * decodedIdToken_original = decodeJwt(idToken);
             * decodedIdToken = decodedIdTokenSchema.parse(decodedIdToken_original)
             *
             * The idea here is that if you have provided a zod schema as `decodedIdTokenSchema`
             * it will strip out every claim that you haven't specified.
             * You might even be applying some transformation.
             *
             * `decodedIdToken_original` is the actual decoded payload of the  id_token, untransformed.
             * */
            decodedIdToken_original: DecodedIdToken_OidcCoreSpec;
            /** Millisecond epoch in the server's time, read from id_token's JWT, iat claim value */
            issuedAtTime: number;

            /** To use instead of Date.now() if you ever need to tell if a token is expired or not */
            getServerDateNow: () => number;
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

        export type DecodedIdToken_OidcCoreSpec = {
            // REQUIRED
            iss: string; // Issuer Identifier
            sub: string; // Subject Identifier
            aud: string | string[]; // Audience(s)
            exp: number; // Expiration time (Unix seconds)
            iat: number; // Issued-at time (Unix seconds)

            // CONDITIONAL
            auth_time?: number; // Authentication time
            nonce?: string; // Nonce
            acr?: string; // Authentication Context Class Reference
            amr?: string[]; // Authentication Methods References
            azp?: string; // Authorized party (for multiple audiences)

            // OPTIONAL standard user claims (OpenID §5.1)
            name?: string;
            given_name?: string;
            family_name?: string;
            middle_name?: string;
            nickname?: string;
            preferred_username?: string;
            profile?: string;
            picture?: string;
            website?: string;
            email?: string;
            email_verified?: boolean;
            gender?: string;
            birthdate?: string;
            zoneinfo?: string;
            locale?: string;
            phone_number?: string;
            phone_number_verified?: boolean;
            address?: Record<string, unknown>;
            updated_at?: number;

            [claimName: string]: unknown;
        };
    }
}
