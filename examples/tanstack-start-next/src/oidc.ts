import { oidcSpa } from "oidc-spa/react-tanstack-start";
import { z } from "zod";
import { decodeJwt } from "oidc-spa/decode-jwt";
import avatarFallbackSvgUrl from "./components/userPictureFallback.svg";

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
    oidcFnMiddleware
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
    .withRuntimeConfigs(({ process }) => {
        if (process.env.OIDC_USE_MOCK === "true") {
            return {
                mode: "mock",
                client: {
                    isUserInitiallyLoggedIn: true
                }
            };
        }

        return {
            mode: "real",
            issuerUri: process.env["OIDC_ISSUER_URI"],
            client: {
                clientId: process.env["OIDC_CLIENT__CLIENT_ID"]
            },
            server: {
                accessTokenValidationMethod: "introspection endpoint",
                clientId: process.env["OIDC_SERVER__CLIENT_ID"],
                clientSecret: process.env["OIDC_SERVER__CLIENT_SECRET"]
                /*
                accessTokenValidationMethod: "offline JWT validation",
                expectedAccessTokenAudience: process.env["OIDC_SERVER__CLIENT_ID"]
                */
            }
        };
    })
    .createUtils();
