import { oidcSpa } from "oidc-spa/react-spa";
import { z } from "zod";

export const { bootstrapOidc, useOidc, getOidc, enforceLogin } = oidcSpa
    .withExpectedDecodedIdTokenShape({
        decodedIdTokenSchema: z.object({
            sub: z.string(),
            name: z.string(),
            picture: z.string().optional(),
            email: z.string().email().optional(),
            preferred_username: z.string().optional(),
            realm_access: z.object({ roles: z.array(z.string()) }).optional()
        }),
        decodedIdToken_mock: {
            sub: "mock-user",
            name: "John Doe",
            preferred_username: "john.doe",
            realm_access: {
                roles: ["realm-admin"]
            }
        }
    })
    .createApi();

// Can be call anywhere, even in the body of a React component.
// All subsequent calls will be safely ignored.
bootstrapOidc(
    import.meta.env.VITE_OIDC_USE_MOCK === "true"
        ? {
              implementation: "mock",
              isUserInitiallyLoggedIn: true
          }
        : {
              implementation: "real",
              issuerUri: import.meta.env.VITE_OIDC_ISSUER_URI,
              clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
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
