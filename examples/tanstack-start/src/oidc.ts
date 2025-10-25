import { oidcSpa } from "oidc-spa/react-tanstack-start";
import { z } from "zod";

export const {
    bootstrapOidc,
    createOidcComponent,
    getOidc,
    enforceLogin,
    oidcFnMiddleware,
    oidcRequestMiddleware
} = oidcSpa
    .withExpectedDecodedIdTokenShape({
        decodedIdTokenSchema: z.object({
            name: z.string(),
            picture: z.string().optional()
        }),
        decodedIdToken_mock: {
            name: "John Doe"
        }
    })
    .withAccessTokenValidation({
        type: "RFC 9068: JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens",
        expectedAudience: (/*{ paramsOfBootstrap, process }*/) => "account",
        accessTokenClaimsSchema: z.object({
            sub: z.string()
        }),
        accessTokenClaims_mock: {
            sub: "123"
        }
    })
    .finalize();

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
