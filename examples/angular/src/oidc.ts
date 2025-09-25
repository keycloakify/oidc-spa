import { createAngularOidc } from 'oidc-spa/angular';
import { z } from 'zod';

export const {
  provideOidcInitAwaiter,
  enforceLoginGuard,
  getOidc,
  get$decodedIdToken,
  get$secondsLeftBeforeAutoLogout,
  getTokens,
} = createAngularOidc(async () => {
  // NOTE: Here you can fetch the issuerUri/clientId if you need to.

  return {
    issuerUri: 'https://cloud-iam.oidc-spa.dev/realms/oidc-spa',
    clientId: 'example-angular',
    decodedIdTokenSchema: z.object({
      iat: z.number(),
      name: z.string(),
    }),
    debugLogs: true,
  };
});
