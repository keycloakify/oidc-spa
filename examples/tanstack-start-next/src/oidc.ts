import { oidcSpa } from "oidc-spa/react-tanstack-start";
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

export type User_server = {
    id: string;
    isAdmin: boolean;
};

export const {
    useOidc,
    getOidc,
    // NOTE: Each time you enforceLogin on a route the oidc-spa vite plugin
    // will automatically switch this route to `ssr: false`.
    // This ensures that everything that can be SSR'd is and the rest is delayed to the client.
    enforceLogin,
    oidcFnMiddleware,
    oidcRequestMiddleware
} = oidcSpa
    .withClientUser<User_client>(async ({ isMock, idTokenClaims, accessToken }) => {
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
    .withServerUser<User_server>(async ({ isMock, accessTokenClaims }) => {
        if (isMock) {
            const user_mock: User_server = {
                id: "mock-user-id",
                isAdmin: true
            };
            return user_mock;
        }

        const { sub, roles } = z
            .object({
                sub: z.string(),
                roles: z.array(z.string()).optional()
            })
            .parse(accessTokenClaims);

        const user: User_server = {
            id: sub,
            isAdmin: roles?.includes("admin") ?? false
        };

        return user;
    })
    // See: https://docs.oidc-spa.dev/features/auto-login#tanstack-start
    //.withAutoLogin()
    .withRuntimeConfigs(async ({ process }) => {
        switch (process.env["OIDC_PROVIDER"]) {
            case "mock":
                return {
                    mode: "mock",
                    client: {
                        isUserInitiallyLoggedIn: true
                    }
                };
            case "Keycloak":
                return {
                    mode: "real",
                    issuerUri: process.env["KEYCLOAK_ISSUER_URI"],
                    client: {
                        clientId: process.env["KEYCLOAK_CLIENT_ID"]
                    },
                    server: {
                        accessTokenValidationMethod: "offline JWT validation",
                        expectedAccessTokenAudience:
                            process.env["KEYCLOAK_EXPECTED_ACCESS_TOKEN_AUDIENCE"]
                    }
                };
            case "Keycloak2":
                return {
                    mode: "real",
                    issuerUri: process.env["KEYCLOAK2_ISSUER_URI"],
                    client: {
                        clientId: process.env["KEYCLOAK2_CLIENT_ID"]
                    },
                    server: {
                        accessTokenValidationMethod: "introspection endpoint",
                        clientId: process.env["KEYCLOAK2_API_CLIENT_ID"],
                        clientSecret: process.env["KEYCLOAK2_API_CLIENT_SECRET"]
                    }
                };
            case "Auth0":
                return {
                    mode: "real",
                    issuerUri: process.env["AUTH0_ISSUER_URI"],
                    client: {
                        clientId: process.env["AUTH0_CLIENT_ID"],
                        authorizationParams: {
                            audience: process.env["AUTH0_API_IDENTIFIER"]
                        },
                        idleSessionLifetimeInSeconds: parseInt(
                            process.env["AUTH0_SSO_SESSION_IDLE_SECONDS"]
                        )
                    },
                    server: {
                        accessTokenValidationMethod: "offline JWT validation",
                        expectedAccessTokenAudience: process.env["AUTH0_API_IDENTIFIER"]
                    }
                };
            case "EntraID":
                return {
                    mode: "real",
                    issuerUri: process.env["ENTRA_ISSUER_URI"],
                    client: {
                        clientId: process.env["ENTRA_CLIENT_ID"],
                        scopes: ["profile", process.env["ENTRA_API_ACCESS_SCOPE"]]
                    },
                    server: {
                        accessTokenValidationMethod: "offline JWT validation",
                        expectedAccessTokenAudience: process.env["ENTRA_API_CLIENT_ID"]
                    }
                };
            default:
                throw new Error("Unknown provider");
        }
    })
    .createUtils();
