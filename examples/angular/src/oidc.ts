import { createAngularOidc } from 'oidc-spa/angular';
import { z } from 'zod';

export const {
  provideOidcInitAwaiter,
  enforceLoginGuard,
  getOidc,
  get$decodedIdToken,
  get$secondsLeftBeforeAutoLogout,
  getAccessToken,
} = createAngularOidc(async () => {
  // NOTE: Here you can fetch the issuerUri/clientId if you need to.

  return {
    issuerUri: 'https://cloud-iam.oidc-spa.dev/realms/oidc-spa',
    clientId: 'example-angular',
    decodedIdTokenSchema: z.object({
      iat: z.number(),
      name: z.string(),
      realm_access: z
        .object({
          roles: z.array(z.string()),
        })
        .optional(),
    }),
    debugLogs: true,
  };
});
