"use client";

import { oidcSpa } from "oidc-spa/react-nextjs";
import { z } from "zod";
import { decodeJwt } from "oidc-spa/decode-jwt";
import avatarFallbackSvg from "@/assets/avatarFallback.svg";

const avatarFallbackSvgUrl: string = avatarFallbackSvg.src;

// App-level user shape exposed by `useOidc()`.
// You decide what an user should looks like!
export type User = {
    displayName: string;
    email: string | undefined;
    avatarImgUrl: string;
    canSeeKeycloakAdminNavigation: boolean;
};

const { bootstrapOidc, useOidc, getOidc, OidcInitializationGate, withLoginEnforced } = oidcSpa
    .withUser<User>({
        createUser: async ({ decodedIdToken, accessToken }) => {
            const { name, picture, email } = z
                .object({
                    sub: z.string(),
                    name: z.string(),
                    picture: z.string().optional(),
                    email: z.string().optional(),
                    preferred_username: z.string().optional()
                })
                .parse(decodedIdToken);

            const decodedAccessToken = z
                .object({
                    resource_access: z
                        .object({
                            "realm-management": z.object({ roles: z.array(z.string()) }).optional()
                        })
                        .optional()
                })
                .parse(decodeJwt(accessToken));

            const user: User = {
                displayName: name,
                avatarImgUrl: picture || avatarFallbackSvgUrl,
                email,
                canSeeKeycloakAdminNavigation:
                    decodedAccessToken.resource_access?.["realm-management"]?.roles.includes(
                        "realm-admin"
                    ) ?? false
            };

            return user;
        },
        user_mock: {
            displayName: "John Doe",
            email: undefined,
            avatarImgUrl: avatarFallbackSvgUrl,
            canSeeKeycloakAdminNavigation: true
        }
    })
    // See: https://docs.oidc-spa.dev/v/v10/features/auto-login#react-spa
    //.withAutoLogin()
    .createUtils();

export { useOidc, getOidc, OidcInitializationGate, withLoginEnforced };

bootstrapOidc(
    process.env.NEXT_PUBLIC_OIDC_USE_MOCK === "true"
        ? {
              implementation: "mock",
              isUserInitiallyLoggedIn: true
          }
        : {
              implementation: "real",
              issuerUri: process.env.NEXT_PUBLIC_OIDC_ISSUER_URI!,
              clientId: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID!,
              debugLogs: process.env.NODE_ENV === "development"
          }
);

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
