# Nuxt example

The same todo application as the Vue, Next.js, and Angular examples, scaffolded with
the official Nuxt CLI:

```sh
npm create nuxt@latest examples/nuxt -- --template v4 --no-install --no-gitInit --packageManager yarn
```

It uses `oidc-spa/vue` and `oidc-spa/nuxt-module`, which currently requires
`ssr: false` in `nuxt.config.ts`. Public pages and navigation render while authentication
initializes. The header waits for `isOidcReady` before showing authentication controls.

## Run locally

Use Node.js 22.22+ and Yarn. From the repository root:

```sh
yarn start-nuxt-example
```

This builds oidc-spa, installs the example dependencies, copies the local library
build into the example, and starts Nuxt at **http://app.localhost:3000**. Nuxt serves
both the application and its APIs; there is no separate Express process.

The default provider is `mock`. It starts with a signed-in admin and needs no
external identity provider. Mock login and logout reload the app with the login
state in the URL.

To use Keycloak, Keycloak introspection (`Keycloak2`), Auth0, or Microsoft Entra ID,
copy `.env.example` to `.env` and choose `NUXT_PUBLIC_OIDC_PROVIDER`. The file contains
the same demo provider settings as the other examples. Register
`http://app.localhost:3000/` as the redirect URI when using your own provider.

Nuxt reads `.env` during development and builds. Production reads environment
variables supplied to the server process. Public configuration uses `NUXT_PUBLIC_*`;
introspection secrets, expected API audiences, and storage credentials use private
`NUXT_*` runtime configuration. Browser and backend use the same provider selection.

## Pages and authentication

-   `/`: public introduction and integration guide.
-   `/todo-list`: personal todos using Nuxt API handlers.
-   `/todo-list-admin`: todos grouped by user, with admin-only deletion.
-   `/account`: profile and Keycloak account actions.
-   `/authentication-error`: public authentication failure screen.
-   `/inactivity-logout`: public inactivity message and a same-origin resume link.

`app/oidc.ts` defines the application user and runtime configuration with the same
builder as the Vue and React examples. Unasserted calls to `useOidc()` expose reactive
fields you can destructure, such as `const { autoLogoutState } = useOidc()`. The header
reads the full snapshot to check readiness before mounting its asserted buttons.

Protected pages live under `app/pages/(authenticated)/`, which adds no URL segment.
They declare `requiresAuth: true`. `app/middleware/auth.global.ts` runs login enforcement
in the browser and redirects initialization failures to the error page.
`app/app.vue` mounts the inactivity warning for signed-in users on every page.

`nuxt.config.ts` registers `oidc-spa/nuxt-module` in `modules` and configures it through
`oidcSpa`. The module installs the existing Vite plugin, which performs early callback
handling before Nuxt starts and enables browser runtime protection and DPoP. The
bootstrap runs only in the client build. The module rejects configurations with SSR
enabled and requires you to explicitly set `ssr: false`.

## Backend

Nuxt's Nitro server hosts the API:

-   `server/api/todos.get.ts` and `todos.post.ts` implement REST handlers. The page uses
    `useFetch()` with an authenticated `$fetch` instance, and `$fetch` for mutations.
-   `server/api/admin/todos.get.ts` and `todos.delete.ts` list all users' todos and
    delete items. Both handlers require the admin role.
-   `server/oidc.ts` validates requests through `oidc-spa/server`, including DPoP-bound
    tokens. Personal todos are scoped by the validated subject, and admin operations
    independently verify the admin role. Authentication failures throw native Nuxt
    errors directly, so the API handlers need no error translation.

The handlers share `server/data/todos/`. By default, todos are stored in local
`todos_*.json` files. Configure `NUXT_KV_REST_API_URL` and `NUXT_KV_REST_API_TOKEN` for
Upstash Redis, including deployments with a read-only or ephemeral filesystem.
`NUXT_TODOS_DIR` optionally selects a local storage directory. This example targets
Nitro's Node server deployment.

## Build and run

Inside this directory, after installing and copying the local library build:

```sh
yarn typecheck
yarn build
yarn start
```

For a deployment below a path, set `NUXT_APP_BASE_URL` (for example `/demo/`) and
register the corresponding redirect URI with the provider. The client API helpers
and authentication redirects use that base URL.
