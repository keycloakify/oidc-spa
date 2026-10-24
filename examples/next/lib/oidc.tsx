"use client";

import { oidcSpa } from "oidc-spa/react-nextjs";
import { z } from "zod";
import { decodeJwt } from "oidc-spa/decode-jwt";
import avatarFallbackSvg from "@/assets/userPictureFallback.svg";

const avatarFallbackSvgUrl: string = avatarFallbackSvg.src;

// App-specific user model exposed by `useOidc()`.
// Shape it around the information the UI needs to render.
export type User_client = {
    displayName: string;
    email: string | undefined;
    avatarImgUrl: string;
    canSeeAdminNavigation: boolean;
};

// App-specific user model exposed to the backend request handler.
// Shape it around what you need to identify and authorize the user.
export type User_server = {
    id: string;
    isAdmin: boolean;
};

export const { useOidc, getOidc, OidcInitializationGate, withLoginEnforced } = oidcSpa
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
        switch (process.env.NEXT_PUBLIC_OIDC_PROVIDER) {
            case "mock":
                return {
                    mode: "mock",
                    isUserInitiallyLoggedIn: true
                };
            case "Keycloak":
                return {
                    mode: "real",
                    issuerUri: process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER_URI!,
                    clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID!,
                    debugLogs: true
                };
            case "Keycloak2":
                return {
                    mode: "real",
                    issuerUri: process.env.NEXT_PUBLIC_KEYCLOAK2_ISSUER_URI!,
                    clientId: process.env.NEXT_PUBLIC_KEYCLOAK2_CLIENT_ID!,
                    debugLogs: true
                };
            case "Auth0":
                return {
                    mode: "real",
                    issuerUri: process.env.NEXT_PUBLIC_AUTH0_ISSUER_URI!,
                    clientId: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID!,
                    authorizationParams: {
                        audience: process.env.NEXT_PUBLIC_AUTH0_API_IDENTIFIER!
                    },
                    idleSessionLifetimeInSeconds: parseInt(
                        process.env.NEXT_PUBLIC_AUTH0_SSO_SESSION_IDLE_SECONDS!
                    ),
                    // DPoP is only available for paying Auth0 customer.
                    disableDPoP: true,
                    debugLogs: true
                };
            case "EntraID":
                return {
                    mode: "real",
                    issuerUri: process.env.NEXT_PUBLIC_ENTRA_ISSUER_URI!,
                    clientId: process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID!,
                    scopes: ["profile", process.env.NEXT_PUBLIC_ENTRA_API_SCOPE!],
                    debugLogs: true
                };
            default:
                throw new Error("Unknown provider");
        }
    })
    .createUtils();
