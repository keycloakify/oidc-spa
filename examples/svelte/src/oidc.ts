import { createSvelteOidc } from "oidc-spa/svelte";
import { createMockSvelteOidc } from "oidc-spa/mock/svelte";
import { z } from "zod";

const decodedIdTokenSchema = z.object({
    sub: z.string(),
    name: z.string()
});

const autoLogin = false;

export const { initializeOidc, OidcContextProvider, useOidc, getOidc, enforceLogin } = !import.meta.env
    .VITE_OIDC_ISSUER_URI
    ? createMockSvelteOidc({
          homeUrl: import.meta.env.BASE_URL,
          mockedTokens: {
              decodedIdToken: {
                  sub: "123",
                  name: "John"
              } satisfies z.infer<typeof decodedIdTokenSchema>
          },
          // NOTE: If autoLogin is set to true this option must be removed
          isUserInitiallyLoggedIn: true,
          autoLogin
      })
    : createSvelteOidc({
          issuerUri: import.meta.env.VITE_OIDC_ISSUER_URI,
          clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
          homeUrl: import.meta.env.BASE_URL,
          decodedIdTokenSchema,
          autoLogin
      });
