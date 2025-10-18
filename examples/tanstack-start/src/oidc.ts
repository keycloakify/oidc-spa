import { oidcSpa } from "oidc-spa/react-tanstack-start";
import { z } from "zod";

const { bootstrapOidc, useOidc, getOidc, enforceLogin, getOidcFnMiddleware, getOidcRequestMiddleware } =
    oidcSpa
        .withExpectedDecodedIdTokenShape({
            decodedIdTokenSchema: z.object({
                preferred_username: z.string()
            }),
            decodedIdToken_mock: {
                preferred_username: "John Doe"
            }
        })
        .withAccessTokenValidation({
            type: "RFC 9068: JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens",
            expectedAudience: "account",
            accessTokenClaimsSchema: z.object({
                sub: z.string()
            }),
            accessTokenClaims_mock: {
                sub: "123"
            }
        })
        .finalize();

bootstrapOidc(({ process }) =>
    process.env.OIDC_USE_MOCK === "true"
        ? {
              implementation: "mock",
              isUserInitiallyLoggedIn: true,
              issuerUri_mock: "https://auth.my-company.com/realms/myrealm",
              decodedIdToken_mock: {
                  preferred_username: process.env.OIDC_MOCK_PREFERRED_USERNAME
              }
          }
        : {
              implementation: "real",
              issuerUri: process.env.OIDC_ISSUER_URI,
              clientId: process.env.OIDC_CLIENT_ID,
              startCountdownSecondsBeforeAutoLogout: 45
          }
);

export { useOidc, getOidc, enforceLogin, getOidcFnMiddleware, getOidcRequestMiddleware };

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
