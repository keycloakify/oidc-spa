# Nuxt SPA Example (`oidc-spa`)

This example shows how to use the `oidc-spa` library in a **pure Nuxt SPA** project.

It is meant as a reference for teams who want to integrate `oidc-spa` in Nuxt with the built-in Nuxt support (`oidc-spa/nuxt-spa`) and standard Nuxt primitives (plugin, composables, middleware).

## ⚠️ Important Disclaimer

> This setup is **SPA-only**.
>
> It works only when `ssr: false` is set in `nuxt.config.ts`.
>
> SSR/hybrid rendering is **not supported by this example** and should not be expected to work as-is.

## What this example includes

-   **Nuxt module integration** via `modules: ["oidc-spa/nuxt-spa"]` in `nuxt.config.ts`
-   **Client plugin setup** in `app/plugins/01.oidc.client.ts`
    -   Creates and provides `$oidc` with either:
        -   `createOidc` (real provider), or
        -   `createMockOidc` (mock mode)
-   **Typed app injection** in `app/types/plugins.d.ts` (`$oidc` type on `NuxtApp`)
-   **Auth composable** in `app/composables/useAuth.ts`
    -   Exposes auth state and helpers (`login`, `logout`, `register`, `fetchWithAuth`, etc.)
    -   Includes auto-logout countdown subscription handling
-   **Route middleware** in `app/middleware/auth.ts`
    -   Protects routes
    -   Triggers login redirects for unauthenticated users
    -   Handles role-based checks through route meta
-   **Protected page examples** in `app/pages/protected.vue` and `app/pages/admin-only.vue`

## Runtime config used

Configured in `nuxt.config.ts` under `runtimeConfig.public`:

-   `oidcIssuerUri`
-   `oidcClientId`
-   `oidcUseMock`

These are typically provided with environment variables (see `.env.local.sample`).

## Quick start

From `examples/nuxt-spa`:

1. Copy env template:

    ```bash
    cp .env.local.sample .env.local
    ```

2. Set your provider values in `.env.local` (or enable mock mode).

3. Install dependencies and run:

    ```bash
    yarn install
    yarn dev
    ```

## If you want to reuse this in your own Nuxt app

At a high level, copy the same pattern:

1. Set `ssr: false` in `nuxt.config.ts`.
2. Add `"oidc-spa/nuxt-spa"` to `modules`.
3. Create a client plugin that provides `$oidc`.
4. Add a composable (`useAuth`) to expose app-level auth helpers/state.
5. Add route middleware for protected pages.

This example is intentionally opinionated and practical, so you can use it as a starting point and adapt provider-specific options as needed.
