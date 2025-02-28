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
    /**
     * This is useful to use the oidc API outside of React.
     */
    getOidc,
    withLoginRequired
} = createReactOidc({
    // If you don't have the parameters right away, it's the case for example
    // if you get the oidc parameters from an API you can pass a promise that
    // resolves to the parameters. `createReactOidc(prParams)`.
    // You can also pass an async function that returns the parameters.
    // `createReactOidc(async () => params)`. It will be called when the <OidcProvider />
    // is first mounted or when getOidc() is called.

    // NOTE: If you are using keycloak, the issuerUri should be formatted like this:
    // issuerUri: https://<YOUR_KEYCLOAK_DOMAIN><KC_RELATIVE_PATH>/realms/<REALM_NAME>
    // KC_RELATIVE_PATH is by default "" in modern keycloak, on older keycloak it used to be "/auth" by default.
    issuerUri: import.meta.env.VITE_OIDC_ISSUER_URI,
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
    __unsafe_clientSecret: import.meta.env.VITE_OIDC_CLIENT_SECRET || undefined,
    __unsafe_useIdTokenAsAccessToken: import.meta.env.VITE_OIDC_USE_ID_TOKEN_AS_ACCESS_TOKEN === "true",
    scopes: (import.meta.env.VITE_OIDC_SCOPE || undefined)?.split(" "),
    homeUrl: import.meta.env.BASE_URL,
    /**
     * This parameter is optional.
     *
     * It allows you to validate the shape of the idToken so that you
     * can trust that oidcTokens.decodedIdToken is of the expected shape
     * when the user is logged in.
     * What is actually inside the idToken is defined by the OIDC server
     * you are using.
     * The usage of zod here is just an example, you can use any other schema
     * validation library or write your own validation function.
     *
     * Note that zod will strip out all the fields that are not defined in the
     * schema, you can use `debugLogs: true` to get the raw decodedIdToken.
     */
    /*
    decodedIdTokenSchema: {
        parse: (decodedIdToken) => {

            type DecodedIdToken = {
                sub: string;
                preferred_username: string
            };

            console.log(decodedIdToken);

            return decodedIdToken as DecodedIdToken;
        }
    },
    */
    decodedIdTokenSchema: z.object({
        sub: z.string(),
        name: z.string()
    }),
    //autoLogoutParams: { redirectTo: "current page" } // Default
    //autoLogoutParams: { redirectTo: "home" }
    //autoLogoutParams: { redirectTo: "specific url", url: "/a-page" }

    // This parameter is optional.
    // It allows you to pass extra query params before redirecting to the OIDC server.
    extraQueryParams: ({ isSilent }) => ({
        audience: import.meta.env.VITE_OIDC_AUDIENCE || undefined,
        ui_locales: isSilent ? undefined : "en" // Here you would dynamically get the current language at the time of redirecting to the OIDC server
    }),
    // Remove this in your repo
    debugLogs: true
});

// Using the mock adapter:
// To use this, just remove the code above and uncomment the code below.
// The mock oidc adapter will be enabled if the OIDC_ISSUER environment variable is not set.
/*
import { createReactOidc } from "oidc-spa/react";
import { createMockReactOidc } from "oidc-spa/mock/react";
import { z } from "zod";

const decodedIdTokenSchema = z.object({
    sub: z.string(),
    preferred_username: z.string()
});


export const { OidcProvider, useOidc, getOidc } =
    !import.meta.env.VITE_OIDC_ISSUER ?
        createMockReactOidc({
            isUserInitiallyLoggedIn: false,
            homeUrl: import.meta.env.BASE_URL,
            mockedTokens: {
                decodedIdToken: {
                    sub: "123",
                    preferred_username: "john doe"
                } satisfies z.infer<typeof decodedIdTokenSchema>
            }
        }) :
        createReactOidc({
            issuerUri: import.meta.env.VITE_OIDC_ISSUER,
            clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
            homeUrl: import.meta.env.BASE_URL,
            decodedIdTokenSchema
        });
*/
