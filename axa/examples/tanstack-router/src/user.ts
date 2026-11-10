import { useOidcAccessToken, useOidcIdToken } from "@axa-fr/react-oidc";
import { z } from "zod";
import avatarFallbackSvgUrl from "./assets/userPictureFallback.svg";

const profileSchema = z.object({
    name: z.string().optional(),
    preferred_username: z.string().optional(),
    email: z.string().optional(),
    picture: z.string().optional()
});
const authorizationSchema = z.object({ roles: z.array(z.string()).optional() });

// AXA exposes decoded token payloads even when the worker hides the real tokens.
// This is an application-specific view model; the API enforces authorization.
export function useUser() {
    const { idTokenPayload } = useOidcIdToken();
    const { accessTokenPayload } = useOidcAccessToken();
    if (!idTokenPayload || !accessTokenPayload) return undefined;

    const profile = profileSchema.parse(idTokenPayload);
    const { roles } = authorizationSchema.parse(accessTokenPayload);
    return {
        displayName: profile.name || profile.preferred_username || "User",
        email: profile.email,
        avatarImgUrl: profile.picture || avatarFallbackSvgUrl,
        canSeeAdminNavigation: roles?.includes("admin") ?? false
    };
}
