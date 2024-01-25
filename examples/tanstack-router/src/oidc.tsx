import { createReactOidc } from "oidc-spa/react";
import { z } from "zod";

export const {
    OidcProvider,
    /**
     * Note: If you have multiple OidcProvider in your app
     * you do not need to use the useClient hook that that corresponds
     * to the above OidcProvider.
     */
    useOidc,
    prOidc
} = createReactOidc({
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
    issuerUri: import.meta.env.VITE_OIDC_ISSUER,
    publicUrl: import.meta.env.BASE_URL,
    /**
     * This parameter is optional.
     *
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
     */
    decodedIdTokenSchema: z.object({
        sub: z.string(),
        preferred_username: z.string()
    })
});
