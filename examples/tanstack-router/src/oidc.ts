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

export const { useOidc, getOidc, OidcInitializationGate, enforceLogin } = oidcSpa
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
    .withRuntimeConfigs(async () => {
        const { router } = await import("./router");
        const autoLogout_returnToUrl = () =>
            router.buildLocation({
                to: "/inactivity-logout",
                search: { return_url: window.location.href }
            }).href;

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
                    autoLogout_returnToUrl,
                    debugLogs: true
                };
            case "Keycloak2":
                return {
                    mode: "real",
                    issuerUri: import.meta.env.VITE_KEYCLOAK2_ISSUER_URI!,
                    clientId: import.meta.env.VITE_KEYCLOAK2_CLIENT_ID!,
                    autoLogout_returnToUrl,
                    debugLogs: true
                };
            case "Auth0":
                return {
                    mode: "real",
                    issuerUri: import.meta.env.VITE_AUTH0_ISSUER_URI!,
                    clientId: import.meta.env.VITE_AUTH0_CLIENT_ID!,
                    autoLogout_returnToUrl,
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
                    autoLogout_returnToUrl,
                    scopes: ["profile", import.meta.env.VITE_ENTRA_API_SCOPE!],
                    debugLogs: true
                };
            default:
                throw new Error("Unknown provider");
        }
    })
    .createUtils();

// Attaches the access token when logged in; otherwise behaves like fetch.
export const fetchWithAuth: typeof fetch = async (input, init) => {
    const oidc = await getOidc();
    if (!oidc.isUserLoggedIn) return fetch(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("Authorization", `Bearer ${await oidc.getAccessToken()}`);

    return fetch(input, { ...init, headers });
};
