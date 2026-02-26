import { createOidc } from "oidc-spa/core";
import { createMockOidc } from "oidc-spa/core-mock";
import { DecodedIdTokenSchema } from "~/schemas/oidc";

export default defineNuxtPlugin({
    name: "oidc",
    enforce: "pre",
    async setup(nuxtApp) {
        const {
            public: { oidcIssuerUri: issuerUri, oidcClientId: clientId, oidcUseMock }
        } = useRuntimeConfig();

        const oidc = oidcUseMock
            ? await createMockOidc({
                  isUserInitiallyLoggedIn: true,
                  mockedParams: { issuerUri, clientId },
                  mockedTokens: {
                      decodedIdToken: {
                          sub: "mock-user",
                          name: "John Doe",
                          preferred_username: "john.doe",
                          realm_access: {
                              roles: ["realm-admin"]
                          }
                      }
                  },
                  BASE_URL: "/"
              })
            : await createOidc({
                  issuerUri,
                  clientId,
                  autoLogin: false,
                  debugLogs: true,
                  autoLogoutParams: { redirectTo: "specific url", url: "/" },
                  BASE_URL: "/",
                  decodedIdTokenSchema: DecodedIdTokenSchema
              });

        nuxtApp.provide("oidc", oidc);
    }
});
