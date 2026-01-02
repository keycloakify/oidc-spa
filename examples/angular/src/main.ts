import { oidcEarlyInit } from 'oidc-spa/entrypoint';

const { shouldLoadApp } = oidcEarlyInit({
  browserRuntimeFreeze: {
    enabled: true,
    //exclude: [ "fetch", "XMLHttpRequest", "Promise"]
  },
});

if (shouldLoadApp) {
  import('./main.lazy');
}
