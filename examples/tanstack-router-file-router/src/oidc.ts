import { oidcSpa } from "oidc-spa/react-spa";
import { z } from "zod";

type User = {
    id: string;
    username: string;
    name: string;
    isAdmin: boolean;
};

export const {
    bootstrapOidc,
    useOidc,
    getOidc,
    enforceLogin,
    // Wrap your whole application within this component in the root route
    // Non blocking rendering is possible, see: https://docs.oidc-spa.dev/v/v9/features/non-blocking-rendering#react-spas
    OidcInitializationGate
} = oidcSpa
    .withExpectedDecodedIdTokenShape({
        // Describe the expected shape of the ID Token.
        // Think of `decodedIdToken` as your “user” object.
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
    .withUserAbstraction<User>({
        createUser: async ({ decodedIdToken }) => {
            // Potentially use fetchWithAuth here to fetch some additional data of the user.

            const user: User = {
                id: decodedIdToken.sub,
                name: decodedIdToken.name,
                username:
                    decodedIdToken.preferred_username ?? decodedIdToken.email ?? decodedIdToken.sub,
                isAdmin: decodedIdToken.realm_access?.roles.includes("realm-admin") ?? false
            };
            return user;
        }
    })
    // See: https://docs.oidc-spa.dev/v/v9/features/auto-login#react-spa
    //.withAutoLogin()
    .createUtils();

/**
 * This can be called immediately or after you've fetched some remote params.
 * If you call this more than once the subsequent calls will be ignored.
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
