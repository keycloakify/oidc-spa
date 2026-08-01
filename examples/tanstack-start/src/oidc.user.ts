import type { CreateUser } from "oidc-spa/core";
import { z } from "zod";
import avatarFallbackSvgUrl from "./components/userPictureFallback.svg";

// App-level user shape exposed by `useOidc()`.
// You decide what an user should looks like!
export type User = {
    username: string;
    displayName: string;
    email: string | undefined;
    avatarImgUrl: string;
    isRealmAdmin: boolean;
};

// The function that oidc-spa will call to create the user object,
// gathering information from different sources depending of what you need.
export const createUser: CreateUser<User> = async ({
    decodedIdToken: decodedIdToken_generic,
    accessToken
}) => {
    const DecodedIdToken = z.object({
        sub: z.string(),
        name: z.string(),
        picture: z.string().optional(),
        email: z.string().optional(),
        preferred_username: z.string().optional()
    });

    const decodedIdToken = DecodedIdToken.parse(decodedIdToken_generic);

    const DecodedAccessToken = z.object({
        realm_access: z.object({ roles: z.array(z.string()) }).optional()
    });

    const { decodeJwt } = await import("oidc-spa/decode-jwt");

    const decodedAccessToken = DecodedAccessToken.parse(decodeJwt(accessToken));

    const user: User = {
        username: decodedIdToken.preferred_username ?? decodedIdToken.sub,
        displayName: decodedIdToken.name,
        avatarImgUrl: decodedIdToken.picture || avatarFallbackSvgUrl,
        email: decodedIdToken.email,
        isRealmAdmin: decodedAccessToken?.realm_access?.roles.includes("realm-admin") ?? false
    };

    return user;
};

// App-level user returned when the mock implementation is enabled.
export const user_mock: User = {
    username: "john.doe",
    displayName: "John Doe",
    email: undefined,
    avatarImgUrl: avatarFallbackSvgUrl,
    isRealmAdmin: true
};
