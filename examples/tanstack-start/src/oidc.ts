import { oidcSpa } from "oidc-spa/react-tanstack-start";
import { z } from "zod";
import { decodeJwt } from "oidc-spa/decode-jwt";
import avatarFallbackSvgUrl from "./components/userPictureFallback.svg";

// App-specific user model exposed by `useOidc()`.
// Shape it around the information the UI needs to render.
export type User = {
    username: string;
    displayName: string;
    email: string | undefined;
    avatarImgUrl: string;
    canSeeKeycloakAdminNavigation: boolean;
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
    .withUser<User>({
        createUser: async ({ decodedIdToken, accessToken }) => {
            const { sub, name, picture, email, preferred_username } = z
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
                username: preferred_username ?? sub,
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
            username: "john.doe",
            displayName: "John Doe",
            email: undefined,
            avatarImgUrl: avatarFallbackSvgUrl,
            canSeeKeycloakAdminNavigation: true
        }
    })
    .withAccessTokenValidation({
        type: "RFC 9068: JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens",
        expectedAudience: (/*{ paramsOfBootstrap, process }*/) => "account",
        accessTokenClaimsSchema: z.object({
            sub: z.string(),
            realm_access: z.object({ roles: z.array(z.string()) }).optional()
        }),
        accessTokenClaims_mock: {
            sub: "mock-user-id",
            realm_access: {
                roles: ["realm-admin"]
            }
        }
    })
    // See: https://docs.oidc-spa.dev/features/auto-login#tanstack-start
    //.withAutoLogin()
    .createUtils();

// Can be call anywhere, even in the body of a React component.
// All subsequent calls will be safely ignored.
bootstrapOidc(({ process }) =>
    process.env.OIDC_USE_MOCK === "true"
        ? {
              implementation: "mock",
              isUserInitiallyLoggedIn: true
          }
        : {
              implementation: "real",
              issuerUri: process.env.OIDC_ISSUER_URI,
              clientId: process.env.OIDC_CLIENT_ID,
              debugLogs: true
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
