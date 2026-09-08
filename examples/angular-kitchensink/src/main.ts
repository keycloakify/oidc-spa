import { oidcEarlyInit } from 'oidc-spa/entrypoint';
import { browserRuntimeFreeze } from 'oidc-spa/browser-runtime-freeze';
import { DPoP } from 'oidc-spa/DPoP';

const { shouldLoadApp } = oidcEarlyInit({
  securityDefenses: {
    ...browserRuntimeFreeze({
      //excludes: [ "fetch", "XMLHttpRequest", "Promise"]
    }),
    ...DPoP({ mode: 'auto' }),
  },
});

if (shouldLoadApp) {
  import('./main.lazy');
}
