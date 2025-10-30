import { oidcSpa } from "oidc-spa/react-spa";
import { z } from "zod";

export const { bootstrapOidc, useOidc, getOidc, enforceLogin } = oidcSpa
    .withExpectedDecodedIdTokenShape({
        // Describe the expected shape of the ID Token.
        // Think of `decodedIdToken` as your “user” object.
        // If you’re unsure what fields are available, open the console:
        // oidc-spa will log the decoded token for you.
        decodedIdTokenSchema: z.object({
            sub: z.string(),
            name: z.string(),
            picture: z.string().optional(),
            email: z.string().email().optional(),
            preferred_username: z.string().optional(),
            realm_access: z.object({ roles: z.array(z.string()) }).optional()
        }),
        // The mock user returned when the mock implementation is enabled.
        decodedIdToken_mock: {
            sub: "mock-user",
            name: "John Doe",
            preferred_username: "john.doe",
            realm_access: {
                roles: ["realm-admin"]
            }
        }
    })
    // If you want to fully shield
    //.withAutoLogin()
    .createUtils();

/**
 * Initializes OIDC once.
 * Can be called anywhere (even inside a React component); subsequent calls are ignored.
 */
bootstrapOidc(
    import.meta.env.VITE_OIDC_USE_MOCK === "true"
        ? {
              // Mock mode: no requests to an auth server are made.
              implementation: "mock",
              isUserInitiallyLoggedIn: true
              // You can also override mock user data here.
          }
        : {
              implementation: "real",
              // Configure your OIDC provider in `.env.local`
              issuerUri: import.meta.env.VITE_OIDC_ISSUER_URI,
              clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
              // Enable for detailed initialization and token lifecycle logs.
              debugLogs: true
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
 * https://docs.oidc-spa.dev/v/v8/talking-to-multiple-apis-with-different-access-tokens
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
