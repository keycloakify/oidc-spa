# oidc-spa + React Router framework mode

Based on the [official React Router framework template](https://github.com/remix-run/react-router-templates/tree/main/default), configured for [SPA mode](https://reactrouter.com/how-to/spa).
The example adds oidc-spa for login, the user profile, protected pages, and account actions.

## Getting started

Use Node.js 22.22 or newer (Node.js 24 LTS recommended).

```sh
npx gitpick keycloakify/oidc-spa/tree/main/examples/react-router-framework start-oidc
cd start-oidc
npm install
npm run dev
```

Yarn and pnpm also work. The install step creates `.env.local` from
`.env.local.sample` without replacing an existing configuration.

## OIDC integration

Start with `app/oidc.ts` and the `oidcSpa()` plugin in `vite.config.ts`.
The provider defaults to the hosted Keycloak demo. Set `VITE_OIDC_USE_MOCK=true`
in `.env.local` to try the example without an identity provider.

Dependencies are pinned to tested versions; `oidc-spa` follows `latest`.

## Checks and production build

```sh
npm run typecheck
npm run build
npm run preview
```

Deploy `build/client` to a static host and configure unknown paths to serve
`index.html`. The preview command is for checking the build locally.

The Dockerfile serves the static SPA with Nginx, including the route fallback:

```sh
docker build -t oidc-spa-react-router .
docker run --rm -p 8080:80 oidc-spa-react-router
```
