# react-router-dom + oidc-spa + Vite + Keycloak

> NOTE: If you are starting a new project consider using
> @tanstack/react-router instead of react-router-dom
> See the [example setup](https://github.com/keycloakify/oidc-spa/tree/main/examples/tanstack-router)

This example setup is deployed here:  
https://example-tanstack-router.oidc-spa.dev/

Run locally:

```bash
git clone https://github.com/keycloakify/oidc-spa
cd oidc-spa/examples/react-router
yarn
yarn dev
```

By default this setup uses our [Cloud IAM](https://www.cloud-iam.com/) Keycloak instance.  
Update the `.env.local` to connect to your authentication server.
