import { oidcEarlyInit } from 'oidc-spa/entrypoint';

const { shouldLoadApp } = oidcEarlyInit({
  // Can be enabled if you're Zoneless, see https://docs.oidc-spa.dev/v/v8/resources/token-exfiltration-defence
  enableTokenExfiltrationDefense: false,
});

if (shouldLoadApp) {
  import('./main.lazy');
}
