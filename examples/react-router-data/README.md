# oidc-spa + React Router data mode

Based on the Vite React + TypeScript starter, with [React Router data mode](https://reactrouter.com/start/data/installation).
The example adds oidc-spa for login, the user profile, protected pages, and account actions.

## Getting started

Use Node.js 22.22 or newer (Node.js 24 LTS recommended).

```sh
npx gitpick keycloakify/oidc-spa/tree/main/examples/react-router-data start-oidc
cd start-oidc
npm install
npm run dev
```

Yarn and pnpm also work. The install step creates `.env.local` from
`.env.local.sample` without replacing an existing configuration.

## OIDC integration

Start with `src/oidc.ts` and the `oidcSpa()` plugin in `vite.config.ts`.
The provider defaults to the hosted Keycloak demo. Set `VITE_OIDC_USE_MOCK=true`
in `.env.local` to try the example without an identity provider.

Dependencies are pinned to tested versions; `oidc-spa` follows `latest`.

## Checks and production build

```sh
npm run typecheck
npm run lint
npm run build
npm run preview
```

Deploy `dist` to a static host and configure unknown paths to serve
`index.html`. The preview command is for checking the build locally.
