# React Router Declarative Mode + oidc-spa

This example mirrors the `examples/react-router-framework` demo but runs as a classic Vite SPA that uses React Router v7 in declarative mode (`<BrowserRouter>`, `<Routes>`, `<Route>`). The UI, comments, and behavior match the framework version so you can compare the two approaches side-by-side.

## Features

-   Tailwind-driven layout with a fixed header, protected routes, and a mocked activity feed.
-   `withLoginEnforced()` and `useOidc()` demonstrate how to gate routes and read identity data without loaders.
-   `fetchWithAuth` automatically attaches access tokens to API calls (see `src/pages/Protected.tsx`).
-   Auto-logout overlay, Keycloak account links, and admin-only navigation mirror the framework example.

## Getting started

```bash
git clone https://github.com/keycloakify/oidc-spa
cd oidc-spa/examples/react-router
yarn
yarn prepare   # copies .env.local.sample on first run
yarn dev
```

Open http://localhost:5173 and use the header actions to authenticate. Update `.env.local` to point at your own identity provider (Keycloak by default). The comments in `src/oidc.ts` and the environment sample highlight tweaks required for Auth0, Google OAuth, and Microsoft Entra ID.
