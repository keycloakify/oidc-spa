import { createOidcProvider, createUseOidc } from "oidc-spa/react";
import { z } from "zod";

export const { OidcProvider, prOidc } = createOidcProvider({
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
    issuerUri: import.meta.env.VITE_OIDC_ISSUER,
    publicUrl: import.meta.env.BASE_URL
});

export const { useOidc } = createUseOidc({
    // This parameter is optional, it allows you to validate the shape of the idToken
    // so that you can trust that oidcTokens.decodedIdToken is of the expected shape when the user is logged in.
    // In most application you do not need to look into the JWT of the idToken on the frontend
    // you usually obtain the user info by querying a GET /user endpoint with a authorization header
    // like `Bearer <accessToken>`.
    decodedIdTokenSchema: z.object({
        sub: z.string(),
        preferred_username: z.string()
    })
});
