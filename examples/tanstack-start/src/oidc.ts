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
    canSeeKeycloakAdminNavigation: boolean;
};

export type User_server = {
    id: string;
    isKeycloakAdmin: boolean;
};

export const {
    bootstrapOidc,
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
                canSeeKeycloakAdminNavigation: true
            };
            return user_mock;
        }

        const { name, picture, email } = z
            .object({
                sub: z.string(),
                name: z.string(),
                picture: z.string().optional(),
                email: z.string().optional(),
                preferred_username: z.string().optional()
            })
            .parse(idTokenClaims);

        const { resource_access } = z
            .object({
                resource_access: z
                    .object({
                        "realm-management": z.object({
                            roles: z.array(z.string())
                        })
                    })
                    .optional()
            })
            .parse(decodeJwt(accessToken));

        const user: User_client = {
            displayName: name,
            avatarImgUrl: picture || avatarFallbackSvgUrl,
            email,
            canSeeKeycloakAdminNavigation:
                resource_access?.["realm-management"].roles.includes("realm-admin") ?? false
        };

        return user;
    })
    .withServerUser<User_server>(async ({ isMock, accessTokenClaims }) => {
        if (isMock) {
            const user_mock: User_server = {
                id: "b42ec423-efb1-4618-8e79-509105c7a4f0",
                isKeycloakAdmin: true
            };
            return user_mock;
        }

        const { sub, resource_access } = z
            .object({
                sub: z.string(),
                resource_access: z
                    .object({
                        "realm-management": z.object({
                            roles: z.array(z.string())
                        })
                    })
                    .optional()
            })
            .parse(accessTokenClaims);

        const user: User_server = {
            id: sub,
            isKeycloakAdmin: resource_access?.["realm-management"].roles.includes("realm-admin") ?? false
        };

        return user;
    })
    // See: https://docs.oidc-spa.dev/features/auto-login#tanstack-start
    //.withAutoLogin()
    .createUtils();

bootstrapOidc(({ process }) => {
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
            clientId: process.env["OIDC_CLIENT_ID"]
        },
        server: {
            accessTokenValidationMethod: "offline JWT validation",
            expectedAccessTokenAudience: process.env["ACCESS_TOKEN_EXPECTED_AUDIENCE"]
        }
    };
});

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
