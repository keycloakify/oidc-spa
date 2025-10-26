import { oidcSpa } from "oidc-spa/react-spa";
import { z } from "zod";

export const { bootstrapOidc, useOidc, getOidc, enforceLogin } = oidcSpa
    .withExpectedDecodedIdTokenShape({
        decodedIdTokenSchema: z.object({
            name: z.string(),
            picture: z.string().optional()
        }),
        decodedIdToken_mock: {
            name: "John Doe"
        }
    })
    .finalize();

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
