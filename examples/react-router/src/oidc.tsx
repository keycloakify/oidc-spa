import { createOidcProvider, createUseOidc } from "oidc-spa/react";
import { z } from "zod";

export const { OidcProvider, prOidc } = createOidcProvider({
    // The import.meta.env.*** are environment variables injected by Vite.
    // You can change them by editing the .env.local file at the root of the project.
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
    issuerUri: import.meta.env.VITE_OIDC_ISSUER,
    publicUrl: import.meta.env.BASE_URL
});

export const { useOidc } = createUseOidc({
    /**
     * This parameter is optional.
     * It allows you to validate the shape of the idToken so that you
     * can trust that oidcTokens.decodedIdToken is of the expected shape
     * when the user is logged in.
     * What is actually inside the idToken is defined by the OIDC server
     * you are using.
     * If you are not sure, you can copy the content of oidcTokens.idToken
     * and paste it on https://jwt.io/ to see what is inside.
     *
     * The usage of zod here is just an example, you can use any other schema
     * validation library or write your own validation function.
     *
     * If you want to specify the type of the decodedIdToken but do not care
     * about validating the shape of the decoded idToken at runtime you can
     * call `createUseOidc<DecodedIdToken>()` without passing any parameter.
     *
     * Note however that in most webapp you do not need to look into the JWT
     * of the idToken on the frontend side, you usually obtain the user info
     * by querying a GET /user endpoint with a authorization header
     * like `Bearer <accessToken>`.
     * If you don't use the decodedIdToken just do:
     * `export const { useOidc } = createUseOidc()`
     */
    decodedIdTokenSchema: z.object({
        sub: z.string(),
        preferred_username: z.string()
    })
});
