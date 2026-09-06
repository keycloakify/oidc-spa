import { oidcSpa } from "oidc-spa/react-spa";
import { z } from "zod";
import { decodeJwt } from "oidc-spa/decode-jwt";
import avatarFallbackSvgUrl from "./assets/avatarFallback.svg";

// App-level user shape exposed by `useOidc()`.
// You decide what an user should looks like!
export type User = {
    displayName: string;
    email: string | undefined;
    avatarImgUrl: string;
    canSeeKeycloakAdminNavigation: boolean;
};

export const { bootstrapOidc, useOidc, getOidc, enforceLogin, OidcInitializationGate } = oidcSpa
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
                            "realm-management": z.object({
                                roles: z.array(z.string())
                            })
                        })
                        .optional()
                })
                .parse(decodeJwt(accessToken));

            const user: User = {
                displayName: name,
                avatarImgUrl: picture || avatarFallbackSvgUrl,
                email,
                canSeeKeycloakAdminNavigation:
                    decodedAccessToken.resource_access?.["realm-management"].roles.includes(
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

/**
 * Call this immediately, or after you fetch remote configuration.
 * If you call it more than once, the later calls are ignored.
 */
bootstrapOidc(
    import.meta.env.VITE_OIDC_USE_MOCK === "true"
        ? {
              // Mock mode: no requests are sent to the auth server.
              implementation: "mock",
              isUserInitiallyLoggedIn: true
              // You can also override `user_mock` here.
          }
        : {
              implementation: "real",
              // Configure your OIDC provider in `.env.local`
              issuerUri: import.meta.env.VITE_OIDC_ISSUER_URI,
              clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
              // Enable for detailed initialization and token lifecycle logs.
              debugLogs: false
          }
);

/**
 * A convenience wrapper around `fetch()` that automatically
 * attaches the access token as an Authorization header when the user is logged in.
 *
 * Usage:
 *   const response = await fetchWithAuth("/api/data");
 *
 * If you need to talk to more than one resource server read this:
 * https://docs.oidc-spa.dev/v/v10/talking-to-multiple-apis-with-different-access-tokens
 */
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
