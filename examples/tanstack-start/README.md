# TanStack Start + oidc-spa

This example is based on the current TanStack Start React scaffold and adds
`oidc-spa` integration for client-owned authentication, protected routes,
server functions, and API routes.

## Getting Started

```bash
npm install
npm run dev
```

The `prepare` script creates `.env` from `.env.sample` when no local `.env`
exists.

## Building For Production

```bash
npm run build
npm run preview
```

## Route Generation

TanStack Router route types are generated with:

```bash
npm run generate-routes
```

The generated file is `src/routeTree.gen.ts`.

## Deployment

This example uses Nitro through the official `nitro/vite` plugin, matching the
current TanStack Start scaffold and Vercel's TanStack Start deployment guide. No
`@tanstack/nitro-v2-vite-plugin` adapter is needed.

## OIDC Configuration

By default, the example uses the hosted Keycloak demo configured in
`.env.sample`.

Set `OIDC_USE_MOCK=true` to run without a real identity provider.

The OIDC integration lives in:

-   `src/oidc.ts`
-   `src/routes/account.tsx`
-   `src/routes/demo/start.server-funcs.tsx`
-   `src/routes/demo/start.api-request.tsx`
-   `src/routes/demo/start.admin-only.tsx`
-   `src/routes/demo/api/*.ts`
