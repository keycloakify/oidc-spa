import { oidcEarlyInit } from 'oidc-spa/entrypoint';

const { shouldLoadApp } = oidcEarlyInit({
  // To improve the security of your app see:
  // https://docs.oidc-spa.dev/security-features/overview
});

if (shouldLoadApp) {
  import('./main.lazy');
}
