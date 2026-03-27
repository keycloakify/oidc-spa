import { oidcSpa, type CreateUser } from "oidc-spa/react-spa";
import { z } from "zod";
import avatarFallbackSvgUrl from "./assets/avatarFallback.svg";

// App-level user shape exposed by `useOidc()`.
type User = {
    id: string;
    username: string;
    displayName: string;
    email: string | undefined;
    avatarImgUrl: string;
    isRealmAdmin: boolean;
    userInfo: {
        sub: string;
        [claim: string]: unknown;
    };
    keycloakUserProfile?: import("oidc-spa/keycloak").KeycloakProfile;
};

const createUser: CreateUser<User> = async ({
    decodedIdToken: decodedIdToken_generic,
    accessToken,
    fetchUserInfo,
    issuerUri
}) => {
    /* ===================== Possible source: ID token claims. ========================= */

    const DecodedIdToken = z.object({
        sub: z.string(),
        name: z.string(),
        picture: z.string().optional(),
        email: z.string().email().optional(),
        preferred_username: z.string().optional()
    });

    const decodedIdToken = DecodedIdToken.parse(decodedIdToken_generic);

    /* ===================== Possible source: access token claims. ===================== */
    // This is pragmatic, but not textbook OIDC: clients should usually
    // treat access tokens as opaque, and some providers do not issue JWTs.

    const DecodedAccessToken = z.object({
        realm_access: z.object({ roles: z.array(z.string()) }).optional()
    });

    const { decodeJwt } = await import("oidc-spa/decode-jwt");
    const { isKeycloak } = await import("oidc-spa/keycloak");

    const decodedAccessToken = !isKeycloak({ issuerUri })
        ? undefined
        : DecodedAccessToken.parse(decodeJwt(accessToken));

    /* ===================== Possible source: your own API. ============================ */

    // const userFromApi = await fetchWithAuth("/api/user").then(r => r.json());

    /* ===================== Possible source: the standard OIDC UserInfo endpoint. ===== */

    const userInfo = await fetchUserInfo();

    /* ===================== Possible source: provider-specific endpoints. ============= */
    const { createKeycloakUtils } = await import("oidc-spa/keycloak");

    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    const keycloakUserProfile = await keycloakUtils?.fetchUserProfile({ accessToken });

    /* ===================== Merging ================================================== */
    // Merge whichever sources you decided to use into the single
    // `User` shape consumed by the rest of the app.

    const user: User = {
        id: decodedIdToken.sub,
        username: decodedIdToken.preferred_username ?? decodedIdToken.sub,
        displayName: decodedIdToken.name,
        avatarImgUrl: decodedIdToken.picture || avatarFallbackSvgUrl,
        email: decodedIdToken.email,
        isRealmAdmin: decodedAccessToken?.realm_access?.roles.includes("realm-admin") ?? false,
        userInfo,
        keycloakUserProfile
    };

    return user;
};

export const {
    bootstrapOidc,
    useOidc,
    getOidc,
    enforceLogin,
    // Wrap your app with this component in the root route.
    // For non-blocking rendering, see:
    // https://docs.oidc-spa.dev/v/v10/features/non-blocking-rendering#react-spas
    OidcInitializationGate
} = oidcSpa
    .withUser<User>({
        // Build the app-level `User` object from whichever token claims
        // and extra data sources make sense for your application.
        createUser,
        // App-level user returned when the mock implementation is enabled.
        user_mock: {
            id: "mock-user",
            username: "john.doe",
            displayName: "John Doe",
            email: undefined,
            avatarImgUrl: avatarFallbackSvgUrl,
            isRealmAdmin: true,
            userInfo: { sub: "1234" },
            keycloakUserProfile: undefined
        }
    })
    // See: https://docs.oidc-spa.dev/v/v10/features/auto-login#react-spa
    //.withAutoLogin()
    .createUtils();

/**
 * Call this immediately, or after you fetch remote configuration.
 * If you call it more than once, the later calls are ignored.
 */
bootstrapOidc(
    import.meta.env.VITE_OIDC_USE_MOCK === "true"
        ? {
              // Mock mode: no requests are sent to the auth server.
              implementation: "mock",
              isUserInitiallyLoggedIn: true
              // You can also override `user_mock` here.
          }
        : {
              implementation: "real",
              // Configure your OIDC provider in `.env.local`
              issuerUri: import.meta.env.VITE_OIDC_ISSUER_URI,
              clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
              // Enable for detailed initialization and token lifecycle logs.
              debugLogs: false
          }
);

/**
 * A convenience wrapper around `fetch()` that automatically
 * attaches the access token as an Authorization header when the user is logged in.
 *
 * Usage:
 *   const response = await fetchWithAuth("/api/data");
 *
 * If you need to call more than one resource server, read:
 * https://docs.oidc-spa.dev/v/v10/talking-to-multiple-apis-with-different-access-tokens
 */
export const fetchWithAuth: typeof fetch = async (input, init) => {
    const oidc = await getOidc();

    if (oidc.isUserLoggedIn) {
        const accessToken = await oidc.getAccessToken();
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${accessToken}`);
        (init ??= {}).headers = headers;
    }

    return fetch(input, init);
};
