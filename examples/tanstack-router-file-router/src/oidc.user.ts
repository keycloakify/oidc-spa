import type { CreateUser } from "oidc-spa/react-spa";
import { z } from "zod";
import avatarFallbackSvgUrl from "./assets/avatarFallback.svg";

// App-level user shape exposed by `useOidc()`.
// You decide what an user should looks like!
export type User = {
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

// The function that oidc-spa will call to create the user object,
// gathering information from different sources depending of what you need.
export const createUser: CreateUser<User> = async ({
    decodedIdToken: decodedIdToken_generic,
    accessToken,
    fetchUserInfo,
    issuerUri
}) => {
    /* ================= Possible source: ID token claims. ====================== */

    const DecodedIdToken = z.object({
        sub: z.string(),
        name: z.string(),
        picture: z.string().optional(),
        email: z.string().email().optional(),
        preferred_username: z.string().optional()
    });

    const decodedIdToken = DecodedIdToken.parse(decodedIdToken_generic);

    /* ================== Possible source: access token claims. ================== */
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

    /* ================= Possible source: your own API. ========================= */

    // const { fetchWithAuth } = await import("./oidc");
    // const userFromApi = await fetchWithAuth("/api/user").then(r => r.json());

    /* ================= Possible source: the standard OIDC UserInfo endpoint. == */

    const userInfo = await fetchUserInfo();

    /* ================= Possible source: provider-specific endpoints. ========== */
    const { createKeycloakUtils } = await import("oidc-spa/keycloak");

    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    const keycloakUserProfile = await keycloakUtils?.fetchUserProfile({ accessToken });

    /* ================== Merging =============================================== */
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

// App-level user returned when the mock implementation is enabled.
export const user_mock: User = {
    id: "mock-user",
    username: "john.doe",
    displayName: "John Doe",
    email: undefined,
    avatarImgUrl: avatarFallbackSvgUrl,
    isRealmAdmin: true,
    userInfo: { sub: "1234" },
    keycloakUserProfile: undefined
};
