# oidc-spa + React Router · Declarative mode

A minimal Vite SPA with React Router declarative mode, an Express REST API, and tRPC.
Both APIs share authentication and todo storage. Bootstrapped with the Vite CLI:

```sh
npm create vite@latest react-router-declarative -- --template react-ts
```

## Run locally

Use Node.js 22.22+ and Yarn:

```sh
yarn
yarn dev
```

Open **http://app.localhost:3000**. Vite serves the SPA and proxies `/api` to Express
on port 3001. Both processes run with one development command.

In the tracked `.env`, choose `VITE_OIDC_PROVIDER`: `Keycloak`, `Keycloak2`
(introspection), `Auth0`, `EntraID`, or `mock`. Mock mode starts with a signed-in
admin without an identity provider.

Vite embeds `VITE_*` settings into the frontend. Restart development after changing
them; rebuild for production. `server/oidc.ts` reads its settings from `process.env`.
Local development and the Node production server load `.env`. Introspection secrets
and KV credentials have no `VITE_` prefix and stay on the server.

To use local oidc-spa source, run `yarn start-react-router-declarative-example` from
the repository root.

## Pages and integration

-   `/`: public introduction and integration guide.
-   `/todo-list-trpc`: personal todos using tRPC.
-   `/todo-list-api`: the same todos using fetch and Express handlers.
-   `/todo-list-admin`: todos grouped by user ID, with admin-only deletion through tRPC.
-   `/account`: profile information and Keycloak account actions.
-   `/inactivity-logout`: public message with a link to resume the previous page.

`vite.config.ts` registers oidc-spa's Vite plugin. Early initialization runs before
application code, enables browser runtime protection and DPoP, and can skip loading
application code in the auth-response iframe. `src/main.tsx` wraps `BrowserRouter`
in `OidcInitializationGate`.

`src/oidc.ts` uses `oidc-spa/react-spa`, maps token claims to `User_client`, and
configures the browser client.

`src/App.tsx` declares the routes with `Routes` and `Route`. A pathless route groups
protected pages under `AuthenticatedLayout`, which is wrapped in `withLoginEnforced`
and mounts `AutoLogoutWarningOverlay`. The header, home, and inactivity page stay
outside the authenticated layout.

Protected page components load data in effects and call tRPC or `fetchWithAuth()`
from event handlers. The admin page displays an explicit message when the current
user lacks the admin role. Server procedures independently enforce that role.

`autoLogout_returnToUrl` sends expired sessions to `/inactivity-logout`, preserving
the previous URL in `return_url`. The page's resume link returns to the saved URL,
whose protected route handles login again.

`server/oidc.ts` independently configures access-token validation and exposes
`getUser(req)`. Both the REST handlers in `server/app.ts` and tRPC procedures in
`server/trpc.ts` authenticate requests. Admin procedures additionally enforce the
admin role. `src/trpc.ts` attaches tokens through the tRPC client's header callback;
the REST page uses `fetchWithAuth()` exported from `src/oidc.ts`. oidc-spa handles
DPoP without changing either request implementation.

The tRPC context carries the Express request. Each procedure calls `getUser()` where
it needs authentication. Batched procedures share that request, allowing oidc-spa to
reuse validation of the request's DPoP proof.

`server/data/todos` is copied from the TanStack Start example. It uses local JSON
files or Upstash Redis when `KV_REST_API_URL` and `KV_REST_API_TOKEN` are configured.
The REST page types its response as `TodoItem[]`; tRPC infers types from the server
router. The UI renders entirely in the browser. If you already have a backend, keep
the SPA and replace the example API calls with requests to that backend.

## Build and run

```sh
yarn typecheck
yarn build
yarn start
```

The build produces static files in `dist/client` and a Node server in `dist/server`.
Express serves both the SPA, including deep links, and the APIs on port 3000. `PORT`
overrides the production port; `API_PORT` overrides the development API port. Update
the Vite proxy if you change `API_PORT`.

## Deploy on Vercel

1. Set the project root to `examples/react-router-declarative`.
2. Configure the provider variables in Vercel before building. Register the deployed
   origin and redirect URL with your provider. Public settings are embedded at build
   time, so the frontend and backend must use matching provider settings.
3. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` for persistent todos; the deployed
   API cannot use local filesystem storage.
4. Deploy using the included `vercel.json`. Static files come from `dist/client`,
   `/api/*` requests go to the Express app exported by `api/index.ts`, and other
   paths fall back to `index.html` for client routing.

The Vercel entry exports the same Express app as the local server. It does not
start a separate listening process.
