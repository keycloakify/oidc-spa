# TanStack Start + oidc-spa

[Live example](https://tanstack-start.oidc-spa.dev/)

This example uses TanStack Start's default server rendering and Nitro deployment setup.
Public pages render on each request. Protected pages render in the browser after their login
check. API routes and server functions run in the same application.

For a static prerendered frontend served by a CDN, see `examples/tanstack-start-prerendered`
(planned as a separate example).

## Run locally

```sh
yarn install
yarn dev
```

Open <http://app.localhost:3000/>. In your identity provider's administration console, register
**`http://app.localhost:3000/` as the redirect URI**. The application's home is the only redirect
URI; no callback route needs to be created. If the app is deployed under `/dashboard/`, register
its full home URL, such as `https://your-app.example/dashboard/`.

Choose `OIDC_PROVIDER` and its corresponding settings in `.env`. The example supports Keycloak,
Auth0, Microsoft Entra ID, and mock mode. Set `OIDC_PROVIDER=mock` to try it without an identity
provider; the mock user is an admin. The `app.localhost` development hostname is needed for
Auth0; other providers can also use `localhost` if their registered redirect URI matches.

To use the current oidc-spa repository source, run this from the repository root:

```sh
yarn start-tanstack-start-example
```

## Integration

-   `vite.config.ts` adds `oidcSpa()` alongside the standard `nitro()`, `tanstackStart()`, and React
    plugins. There is no custom server entry or deployment routing.
-   `src/oidc.ts` defines the client and server user models, runtime provider configuration,
    hooks, login guard, and token validation middleware.
-   `src/routes/__root.tsx` contains the document and shared UI: header, page outlet, and inactivity
    warning overlay.
-   `src/routes/_authenticated/route.tsx` protects the account and todo pages with
    `beforeLoad: enforceLogin`. The layout is pathless: `_authenticated` does not appear in URLs.
-   `/todo-list-server-function` uses Start server functions with `oidcFnMiddleware`.
-   `/todo-list-api` calls the `/api/todos` resource route through `fetchWithAuth`;
    `oidcRequestMiddleware` validates its access tokens.
-   `/todo-list-admin` checks admin permissions on the server. `/account` displays the user profile
    and Keycloak account actions. `/inactivity-logout` is public and links back to the previous page.

Both todo implementations share the same per-user store. Browser login state is not authorization
for the backend: the middleware validates each request's access token independently.

When registering your own backend API with your provider, configure its audience and required
scopes, allow this application's public client to request them, and update `src/oidc.ts` to match.
Configure the provider's claims or roles for the server user model, including the `admin` role
used by this example. The included configurations demonstrate offline JWT validation and token
introspection; `Keycloak2` uses introspection.

Hosting the app on the same site as the authorization server avoids redirects and flashes during
session restoration. Microsoft Entra ID is an exception because its authorization endpoint has
a fixed domain.

## Build and deploy

```sh
yarn build
yarn preview
```

The build command is `vite build && tsc --noEmit`. Locally, Nitro produces its standard Node
server output in `.output`; you can run it directly with `node .output/server/index.mjs`.

For Vercel, import the repository with `examples/tanstack-start` as the project root.
`vercel.json` matches the official CLI scaffold and selects the `tanstack-start` framework.
Vercel and Nitro detect the deployment environment automatically; no custom build command,
rewrites, or `NITRO_PRESET` setting is needed. To inspect a Vercel build locally:

```sh
NITRO_PRESET=vercel yarn build
```

Set the provider environment variables in the deployment environment. Do not prefix secrets with
`VITE_`. Configure `KV_REST_API_URL` and `KV_REST_API_TOKEN` for persistent todos on Vercel;
the filesystem fallback is intended for local development or a Node host with persistent storage.

The framework setup follows the [official TanStack Start CLI](https://tanstack.com/start/latest/docs/framework/react/getting-started)
and [Vercel deployment guide](https://tanstack.com/start/latest/docs/framework/react/guide/hosting#vercel--official-partner).
