# Nuxt SPA example

A Nuxt 4 application with Nuxt UI and oidc-spa authentication. The setup follows the official minimal and Nuxt UI templates generated with `create-nuxt` 3.37.0.

## Getting started

Use Node.js 24.11+ (24.x LTS). Nuxt also supports Node.js 22.19+ (22.x) and 26+.

```bash
npx gitpick keycloakify/oidc-spa/tree/main/examples/nuxt-spa start-oidc
cd start-oidc
npm install
npm run dev
```

Open http://localhost:3000. Yarn and pnpm also work: use `yarn install` / `yarn dev` or `pnpm install` / `pnpm dev`.

Installation creates `.env.local` from `.env.local.sample` if it does not already exist, and `nuxt prepare` generates the framework types and ESLint configuration. Set your provider values in `.env.local`, or use `NUXT_PUBLIC_OIDC_USE_MOCK=true` to try the application without an identity provider. Restart the development server after changing configuration.

From the oidc-spa repository root, `yarn start-nuxt-spa-example` builds and copies the local library before starting this example.

## Commands

-   `npm run dev` — start the development server.
-   `npm run build` — create a production build in `.output`.
-   `npm run preview` — preview the production build locally.
-   `npm run generate` — generate a static SPA in `.output/public`.
-   `npm run typecheck` — check the application with Nuxt and `vue-tsc`.
-   `npm run lint` — run the standard Nuxt ESLint configuration.
-   `npm run lint:fix` — apply automatic lint fixes.

The development, build, generation, preview, and type-check commands load `.env.local` explicitly.

## OIDC integration

See the [Nuxt integration guide](https://docs.oidc-spa.dev/integration-guides/nuxt).

-   `nuxt.config.ts` sets `ssr: false` and enables `oidc-spa/nuxt-spa` for early client initialization.
-   `app/oidc.user.ts` defines the application `User`, `createUser`, and `user_mock`. Token validation and provider-specific claims stay in this file; components consume `displayName`, `email`, `avatarImgUrl`, and `canSeeKeycloakAdminNavigation`.
-   `app/plugins/01.oidc.client.ts` creates `$oidc`, awaits its initial user, and subscribes once to user changes and the auto-logout countdown. Nuxt infers the injected types from the plugin's return value.
-   User state uses a [shallow ref](https://vuejs.org/api/reactivity-advanced.html#shallowref) to preserve core's user objects. Changes from token renewal or `refreshUser()` update every consumer.
-   `app/composables/useAuth.ts` exposes the reactive `user`, `refreshUser()`, authentication and account actions, the auto-logout warning, and authenticated requests using `oidc.getAccessToken()`.
-   `app/middleware/auth.ts` enforces login. The admin link and page use `user.canSeeKeycloakAdminNavigation`; they do not read token claims.

In mock mode, the plugin passes `user_mock` directly to core, without constructing fake tokens or invoking `createUser`. The mock user is John Doe with admin navigation enabled. For real Keycloak sessions, the admin capability comes from the access token's `resource_access["realm-management"].roles`. Other providers do not need JWT access tokens for this example.

This example authenticates in the browser and requires `ssr: false`. Its route guards control client navigation; APIs must validate access tokens independently.

Public runtime configuration uses these environment variables:

| Environment variable          | Runtime config key     |
| ----------------------------- | ---------------------- |
| `NUXT_PUBLIC_OIDC_ISSUER_URI` | `public.oidcIssuerUri` |
| `NUXT_PUBLIC_OIDC_CLIENT_ID`  | `public.oidcClientId`  |
| `NUXT_PUBLIC_OIDC_USE_MOCK`   | `public.oidcUseMock`   |

## Routes and deployment

-   `/` — public landing page.
-   `/protected` — guarded page with authenticated API requests.
-   `/admin-only` — guarded page with an application-user capability check.

For static hosting, run `npm run generate` and deploy `.output/public`. Configure the host to serve `index.html` for application routes (Nuxt also generates `200.html` and `404.html` fallbacks). Public runtime configuration is baked into static output, so set it before generation.

For a Node deployment, run `npm run build`, set the `NUXT_PUBLIC_OIDC_*` environment variables on the server, and start it with `node .output/server/index.mjs`. The production server does not automatically load `.env.local`.

## Tooling

Nuxt UI configures Tailwind and Nuxt Icon. Lucide icons are installed locally. Linting uses `@nuxt/eslint`, and TypeScript project references follow the Nuxt 4 starter.

Direct dependencies are pinned, except `oidc-spa`, which stays on `latest`. No lockfile or package manager is imposed on users; transitive dependencies can still change between fresh installations. The pnpm build-script policy follows the official Nuxt UI starter (pnpm 10.26+).
