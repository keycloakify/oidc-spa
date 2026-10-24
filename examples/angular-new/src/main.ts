import { oidcEarlyInit } from 'oidc-spa/entrypoint';
import { browserRuntimeFreeze } from 'oidc-spa/browser-runtime-freeze';
import { DPoP } from 'oidc-spa/DPoP';

const { shouldLoadApp } = oidcEarlyInit({
  BASE_URL: document.querySelector('base')?.getAttribute('href') ?? '/',
  securityDefenses: {
    ...browserRuntimeFreeze({}),
    ...DPoP({ mode: 'auto' }),
  },
});

if (shouldLoadApp) {
  import('./main.lazy');
}
