# oidc-spa + React Router framework mode

A minimal React Router SPA with the same pages, authentication, and dark styling
as the Next.js example. Bootstrapped with `create-react-router@8.5.0`.

## Run locally

Use Node.js 22.22+ and Yarn:

```sh
yarn
yarn dev
```

Open **http://app.localhost:3000**. Vite proxies `/api` to the Express backend on
`127.0.0.1:3001`; both processes start and stop together.

Postinstall copies `.env.sample` to `.env` only when `.env` does not exist. Choose
`VITE_OIDC_PROVIDER` in `.env`. The sample includes Keycloak, Keycloak with token
introspection, Auth0, Microsoft Entra ID, and mock mode. For a local demonstration
without an identity provider, use `VITE_OIDC_PROVIDER=mock`.

Restart development after changing environment variables. Public `VITE_*` values
are embedded in the frontend at build time; rebuild to change them in production.
Introspection secrets and KV credentials have no public prefix.

## Pages and integration

-   `/`: an introduction and integration guide.
-   `/todo-list-trpc`: list and add personal todos with tRPC.
-   `/todo-list-api`: the same functionality using fetch and Express route handlers.
-   `/todo-list-admin`: list all users' todos and delete items as an admin.
-   `/account`: profile information and Keycloak account actions when available.

`react-router.config.ts` sets `ssr: false`. The root `HydrateFallback` returns
`null`, and `OidcInitializationGate` wraps the whole application. The oidc-spa Vite
plugin installs early initialization, browser runtime protection, and automatic
DPoP support.

`app/oidc.ts` uses `oidc-spa/react-spa`, maps claims to the application's user model,
and configures the browser's OIDC client. Protected routes use `clientLoader` and
`enforceLogin(args)`. The pinned rc.7 release has a `request.href` mismatch; a
small compatibility wrapper in `app/oidc.ts` adapts React Router's `request.url`
until the SDK fix is published. Todo mutations use `clientAction` and React Router forms;
React Router reloads the route data after a successful action.

The Express backend in `server/app.ts` serves REST endpoints and tRPC procedures.
`server/oidc.ts` independently configures access-token validation and exposes
`getUser(req)`. Handlers authenticate each request; admin procedures also enforce
the admin role. Client-side guards only control navigation and rendering.

The included backend uses `oidc-spa/server`; an independent backend can validate
tokens with its own implementation. Configuration getters can be synchronous or
asynchronous; environment variables are one possible source of configuration.

`server/data` is copied unchanged from `examples/next/lib/server/data`. Local
storage uses `todos_*.json` files, while `KV_REST_API_URL` and `KV_REST_API_TOKEN`
enable Upstash Redis. The backend build resolves the copied Next.js `server-only`
guard using its `react-server` export condition. This does not enable SSR.

## Build and run

```sh
yarn typecheck
yarn build
yarn start
```

The frontend is emitted to `build/client`; the API is built to
`build/server/app.mjs`. The production Express server serves both the API and the
static SPA, including deep links.

## Deploy on Vercel

1. Set the project root directory to `examples/react-router-framework`.
2. Configure the chosen provider's environment variables before building. Register
   the deployment's origin and redirect URL with the provider.
3. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` for persistent todo storage.
   Vercel's filesystem cannot be used for these writes.
4. Deploy using the included `vercel.json`. It builds the React Router SPA as a
   Vite frontend and routes `/api/*` to the Express Vercel Function in
   `api/index.js`. Other application paths fall back to `index.html`.

Frontend and API are deployed together. No SSR runtime or Docker setup is needed.
