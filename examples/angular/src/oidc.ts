import { createAngularOidc } from 'oidc-spa/angular';

export const { provideOidcInitAwaiter, enforceLoginGuard, getOidc, get$decodedIdToken } =
  createAngularOidc({
    homeUrl: '/',
    issuerUri: 'https://cloud-iam.oidc-spa.dev/realms/oidc-spa',
    clientId: 'example-angular',
  });
