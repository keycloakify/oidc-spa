import { createAngularOidc } from 'oidc-spa/angular';
import { z } from 'zod';

export const {
  provideOidcInitAwaiter,
  enforceLoginGuard,
  getOidc,
  get$decodedIdToken,
  get$secondsLeftBeforeAutoLogout,
  getOidcInitializationError,
} = createAngularOidc({
  homeUrl: '/',
  issuerUri: 'https://cloud-iam.oidc-spa.dev/realms/oidc-spa',
  clientId: 'example-angular',
  decodedIdTokenSchema: z.object({
    iat: z.number(),
    name: z.string(),
  }),
  debugLogs: true,
});
