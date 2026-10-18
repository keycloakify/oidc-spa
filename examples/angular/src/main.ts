import { oidcEarlyInit } from 'oidc-spa/entrypoint';

const { shouldLoadApp } = oidcEarlyInit({
  BASE_URL: document.querySelector('base')?.getAttribute('href') ?? '/',
});

if (shouldLoadApp) {
  import('./main.lazy');
}
