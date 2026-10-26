# oidc-spa + React Router framework mode

A minimal full-stack todo app using oidc-spa and React Router's native server
loaders and actions. The UI renders in the browser; React Router hosts the backend
with `ssr: "unstable_api-only"`. Bootstrapped with `create-react-router@8.5.0`.

## Run locally

Use Node.js 22.22+ and Yarn:

```sh
yarn
yarn dev
```

Open **http://app.localhost:3000**. One React Router development server handles
both the application and its server loaders/actions.

The oidc-spa Vite plugin serves the API-only development shell without running
server loaders or middleware. The browser then requests authenticated loader data,
matching the production loading flow. No custom development plugin or
`optimizeDeps.include` configuration is needed.

Postinstall copies `.env.sample` to `.env` only when `.env` does not exist. Choose
`VITE_OIDC_PROVIDER`: Keycloak, Keycloak with token introspection, Auth0, Microsoft
Entra ID, or mock mode. For a demonstration without an identity provider, use
`VITE_OIDC_PROVIDER=mock`.

Restart development after changing environment variables. Public `VITE_*` values
are embedded in the frontend at build time; rebuild to change them in production.
Introspection secrets and KV credentials have no public prefix. The backend reads
its configuration from `process.env`; local development and `yarn start` load `.env`.

## Pages and integration

-   `/`: an introduction and integration guide.
-   `/todo-list`: list and add personal todos.
-   `/todo-list-admin`: list all users' todos and delete items as an admin.
-   `/account`: profile information and Keycloak account actions when available.

`react-router.config.ts` selects API-only mode. The root `HydrateFallback` returns
`null`, and `OidcInitializationGate` wraps the whole application. The oidc-spa Vite
plugin installs early initialization, browser runtime protection, and automatic
DPoP support. It defers the document's executable scripts, including React Router's
root imports and development runtime, until early initialization permits loading
the app. In the callback iframe, those scripts and application module preloads
remain inactive when `shouldLoadApp` is false.

The integration supports conventional Framework mode with `ssr: false` or
`ssr: "unstable_api-only"`. API-only compatibility is tested with React Router
8.5.0; experimental framework changes may require plugin updates. Unrecognized
bootstrap output fails explicitly. Executable HTML attributes and active embedded
documents in the document shell should instead live inside the initialized app;
the plugin rejects shells that could execute code before its bootstrap.

`app/oidc.ts` uses `oidc-spa/react-spa`, maps claims to the application's user model,
and configures the browser's OIDC client. Protected routes use `clientLoader` and
`enforceLogin(args)`, then call `args.serverLoader()`. Mutations use `clientAction`,
`enforceLogin(args)`, and `args.serverAction()`. React Router forms submit the action
and automatically revalidate loader data afterward. No `clientLoader.hydrate` flag
is needed for this setup without prerendering.

The pinned rc.7 SDK release has a `request.href` mismatch; a small compatibility
wrapper in `app/oidc.ts` adapts React Router's `request.url` until the SDK fix is
published.

`app/entry.client.tsx` uses `HydratedRouter`'s `unstable_fetch` to attach the current
access token to same-origin loader/action requests. It waits for OIDC initialization
itself because initial router requests can start before the initialization gate
renders. Route discovery requests do not need a token. Do not enable native link
data prefetching (`prefetch` or `PrefetchPageLinks`) for protected routes: these
browser-issued requests bypass the custom fetch.

`app/oidc.server.ts` independently configures access-token validation and exposes
`getUser(request)`. Every server loader/action authenticates the request; admin
handlers also enforce the admin role. Client guards control navigation, while
server checks protect the data. Authentication failures become HTTP error responses.
React Router strips server loaders/actions and `.server` modules from the browser
build.

`app/.server/data/todos` reuses the Next.js todo storage implementation, replacing
its `server-only` import with React Router's `.server` directory boundary. Storage
uses local `todos_*.json` files, or Upstash Redis when `KV_REST_API_URL` and
`KV_REST_API_TOKEN` are set.

API-only mode and custom fetch are currently experimental React Router APIs. Their
behavior is pinned by the exact dependency versions in this example.

## Use your own backend instead

This oidc-spa integration supports `ssr: "unstable_api-only"` and `ssr: false`.
It does not provide server-rendered authentication with `ssr: true`.

To turn the example into a static SPA:

1. Set `ssr: false` in `react-router.config.ts`.
2. Delete `app/entry.client.tsx`, `app/oidc.server.ts`, `app/.server/`, and `api/`.
3. Remove server `loader`/`action` exports and their server-only imports from routes.
   Runtime server loaders and actions are unavailable in SPA mode.
4. Keep `enforceLogin(args)` in client loaders/actions, but replace
   `args.serverLoader()` and `args.serverAction()` with requests to your own API.
   Get an access token with `getOidc()` and `oidc.getAccessToken()`, and attach it as
   `Authorization: Bearer …` to requests to your trusted API.
5. Deploy `build/client` to static hosting with a fallback to `index.html`. Remove
   the `.data` and `/__manifest` function rewrites from `vercel.json`. The `start`
   script and `@react-router/serve` are no longer needed.

The initialization gate, early initialization, and client route guards remain.
Your backend can validate tokens using oidc-spa/server or its own implementation.

## Build and run

```sh
yarn typecheck
yarn build
yarn start
```

`react-router-serve` serves `build/client` and the native server build, including
SPA deep links, `.data` requests, and route discovery. There is no separate API
process or custom application server.

## Deploy on Vercel

1. Set the project root directory to `examples/react-router-framework`.
2. Configure the chosen provider's environment variables before building. Register
   the deployment's origin and redirect URL with the provider.
3. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` for persistent todo storage;
   Vercel's filesystem cannot be used for these writes.
4. Deploy with the included `vercel.json`. Static files and SPA deep links come
   from `build/client`. `.data` and `/__manifest` requests go to `api/index.js`,
   which forwards them to the native React Router request handler.

The small Vercel adapter is deployment plumbing only. Application backend code
lives in the route loaders/actions; no Express or tRPC setup is needed.
