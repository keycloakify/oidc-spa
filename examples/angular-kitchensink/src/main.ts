import { oidcEarlyInit } from 'oidc-spa/entrypoint';
import { browserRuntimeFreeze } from 'oidc-spa/browser-runtime-freeze';
import { DPoP } from 'oidc-spa/DPoP';
import { tokenSubstitution } from 'oidc-spa/token-substitution';

const { shouldLoadApp } = oidcEarlyInit({
  securityDefenses: {
    ...browserRuntimeFreeze({
      //exclude: [ "fetch", "XMLHttpRequest", "Promise"]
    }),
    ...DPoP({
      mode: 'auto',
    }),
    ...tokenSubstitution({
      trustedThirdPartyResourceServers: ['jsonplaceholder.typicode.com'],
    }),
  },
});

if (shouldLoadApp) {
  import('./main.lazy');
}
