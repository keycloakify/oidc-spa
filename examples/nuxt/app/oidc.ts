import { useRuntimeConfig } from "#imports";
import { oidcSpa } from "oidc-spa/vue";
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

export const { useOidc, getOidc, enforceLogin } = oidcSpa
    .withUser<User_client>(async ({ isMock, idTokenClaims, accessToken }) => {
        if (isMock) {
            const user_mock: User_client = {
                displayName: "John Doe",
                email: "john.doe@gmail.com",
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

        const accessTokenClaims = decodeJwt(accessToken);

        const { roles } = z
            .object({
                roles: z.array(z.string()).optional()
            })
            .parse(accessTokenClaims);

        const user: User_client = {
            displayName: name,
            avatarImgUrl: picture || avatarFallbackSvgUrl,
            email,
            canSeeAdminNavigation: roles?.includes("admin") ?? false
        };

        return user;
    })
    .withRuntimeConfigs(async () => {
        const { public: config } = useRuntimeConfig();
        const autoLogout_returnToUrl = () =>
            `/inactivity-logout?return_url=${encodeURIComponent(location.href)}`;

        switch (config.oidcProvider) {
            case "mock":
                return {
                    mode: "mock",
                    isUserInitiallyLoggedIn: true
                };
            case "Keycloak":
                return {
                    mode: "real",
                    issuerUri: config.keycloakIssuerUri,
                    clientId: config.keycloakClientId,
                    autoLogout_returnToUrl,
                    debugLogs: true
                };
            case "Keycloak2":
                return {
                    mode: "real",
                    issuerUri: config.keycloak2IssuerUri,
                    clientId: config.keycloak2ClientId,
                    autoLogout_returnToUrl,
                    debugLogs: true
                };
            case "Auth0":
                return {
                    mode: "real",
                    issuerUri: config.auth0IssuerUri,
                    clientId: config.auth0ClientId,
                    autoLogout_returnToUrl,
                    authorizationParams: {
                        audience: config.auth0ApiIdentifier
                    },
                    idleSessionLifetimeInSeconds: Number(config.auth0SsoSessionIdleSeconds),
                    // DPoP is only available for paying Auth0 customer.
                    disableDPoP: true,
                    debugLogs: true
                };
            case "EntraID":
                return {
                    mode: "real",
                    issuerUri: config.entraIssuerUri,
                    clientId: config.entraClientId,
                    autoLogout_returnToUrl,
                    scopes: ["profile", config.entraApiScope],
                    debugLogs: true
                };
            default:
                throw new Error("Unknown provider");
        }
    })
    .createUtils();
