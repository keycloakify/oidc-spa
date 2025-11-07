import { oidcEarlyInit } from 'oidc-spa/entrypoint';

const { shouldLoadApp } = oidcEarlyInit({
  safeMode: true,
  // This project is Zoneless, if you want to enable Zone.js:
  //freezePromise: false
});

if (shouldLoadApp) {
  import('./main.lazy');
}
