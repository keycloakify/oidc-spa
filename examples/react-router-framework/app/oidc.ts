import { oidcSpa } from "oidc-spa/react-spa";
import { z } from "zod";
import { decodeJwt } from "oidc-spa/decode-jwt";
import avatarFallbackSvgUrl from "./assets/userPictureFallback.svg";

// App-specific user model exposed by `useOidc()`.
// Shape it around the information the UI needs to render.
export type User_client = {
    displayName: string;
    email: string | undefined;
    avatarImgUrl: string;
    canSeeAdminNavigation: boolean;
};

export const {
    useOidc,
    getOidc,
    OidcInitializationGate,
    enforceLogin: enforceLogin_impl
} = oidcSpa
    .withUser<User_client>(async ({ isMock, idTokenClaims, accessToken }) => {
        if (isMock) {
            const user_mock: User_client = {
                displayName: "John Doe",
                email: "jonh.doe@gmail.com",
                avatarImgUrl: avatarFallbackSvgUrl,
                canSeeAdminNavigation: true
            };
            return user_mock;
        }

        const { name, picture, email } = z
            .object({
                name: z.string(),
                picture: z.string().optional(),
                email: z.string().optional()
            })
            .parse(idTokenClaims);

        const { roles } = z
            .object({
                roles: z.array(z.string()).optional()
            })
            .parse(decodeJwt(accessToken));

        const user: User_client = {
            displayName: name,
            avatarImgUrl: picture || avatarFallbackSvgUrl,
            email,
            canSeeAdminNavigation: roles?.includes("admin") ?? false
        };

        return user;
    })
    // See: https://docs.oidc-spa.dev/features/auto-login#react-spa
    //.withAutoLogin()
    .withRuntimeConfigs(async () => {
        switch (import.meta.env.VITE_OIDC_PROVIDER) {
            case "mock":
                return {
                    mode: "mock",
                    isUserInitiallyLoggedIn: true
                };
            case "Keycloak":
                return {
                    mode: "real",
                    issuerUri: import.meta.env.VITE_KEYCLOAK_ISSUER_URI!,
                    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID!,
                    debugLogs: true
                };
            case "Keycloak2":
                return {
                    mode: "real",
                    issuerUri: import.meta.env.VITE_KEYCLOAK2_ISSUER_URI!,
                    clientId: import.meta.env.VITE_KEYCLOAK2_CLIENT_ID!,
                    debugLogs: true
                };
            case "Auth0":
                return {
                    mode: "real",
                    issuerUri: import.meta.env.VITE_AUTH0_ISSUER_URI!,
                    clientId: import.meta.env.VITE_AUTH0_CLIENT_ID!,
                    authorizationParams: {
                        audience: import.meta.env.VITE_AUTH0_API_IDENTIFIER!
                    },
                    idleSessionLifetimeInSeconds: parseInt(
                        import.meta.env.VITE_AUTH0_SSO_SESSION_IDLE_SECONDS!
                    ),
                    // DPoP is only available for paying Auth0 customer.
                    disableDPoP: true,
                    debugLogs: true
                };
            case "EntraID":
                return {
                    mode: "real",
                    issuerUri: import.meta.env.VITE_ENTRA_ISSUER_URI!,
                    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID!,
                    scopes: ["profile", import.meta.env.VITE_ENTRA_API_SCOPE!],
                    debugLogs: true
                };
            default:
                throw new Error("Unknown provider");
        }
    })
    .createUtils();

// Compatibility with rc.7, whose React Router guard reads request.href.
// Export the SDK's enforceLogin directly once its request.url fix is released.
export function enforceLogin(args: { request: Request }) {
    const request = { url: args.request.url, href: args.request.url };
    return enforceLogin_impl({ request });
}
