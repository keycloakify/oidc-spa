# Vue adapter example

The same todo app as `examples/tanstack-router`, implemented with Vue and Vue Router.
It uses `oidc-spa/vue` for authentication, reactive user state, initialization, and
route protection.

## Run locally

Use Node.js 22.22+ and Yarn. From the repository root:

```sh
yarn start-vue-example
```

This builds the library, installs the example dependencies, copies the local build
into the example, and starts Vite and Express. Open **http://app.localhost:3000**.
Vite proxies `/api` to port 3001.

To run against the published library instead, start inside this directory:

```sh
yarn
yarn dev
```

Set `VITE_OIDC_PROVIDER=mock` in `.env` to explore as a signed-in admin without an
external identity provider. Logout and login reload the app with the mock login
state in the URL. Both API implementations use mock validation in this mode.

To use a real provider, choose `Keycloak`, `Keycloak2` (introspection), `Auth0`, or
`EntraID` and replace its placeholder settings in `.env`. Register
`http://app.localhost:3000/openid-callback/` as the redirect URI and allow the app's origin at your
provider. Restart development or rebuild after configuration changes. The browser
and API must use matching provider settings. `VITE_*` values are public and embedded
in the frontend; introspection secrets and KV credentials stay on the server.
Local development, the Node production server, and the Vercel function load `.env`.
Existing environment variables take precedence over the file.

## Pages

-   `/`: public introduction and integration guide.
-   `/todo-list-trpc`: personal todos using tRPC.
-   `/todo-list-api`: the same todos using fetch and Express handlers.
-   `/todo-list-admin`: todos grouped by user ID, with admin-only deletion.
-   `/account`: profile information and Keycloak account actions.
-   `/authentication-error`: public authentication failure screen.
-   `/inactivity-logout`: public message and a link to resume the previous page.

## The Vue adapter

`src/oidc.ts` defines the application user and runtime configuration through
`oidcSpa.withUser(...).withRuntimeConfigs(...).createUtils()`, matching the React
adapter's builder. It exports `useOidc`, `getOidc`, and `enforceLogin`.

-   `App.vue` mounts the header and router view immediately. Public pages render while
    OIDC initializes; the header waits for `isOidcReady` before showing authentication
    controls. Public pages remain available on initialization failure.
-   `useOidc()` exposes reactive authentication state, including `isOidcReady` and
    `initializationError`. Use `useOidc({ assert: "user logged in" })` in protected
    components for narrowed types.
-   Fields destructured from `useOidc()` are computed refs. Destructure them at the
    top level of `<script setup>` for automatic template unwrapping; in TypeScript,
    read `.value`. The header uses `isUserLoggedIn && user?.canSeeAdminNavigation`
    for admin navigation. After checking readiness, it mounts separate logged-in
    and logged-out button components using the corresponding assertions.
-   `getOidc()` provides the asynchronous core API outside components. It can also be
    called from `createUser()` to fetch an access token while the user is being built.
-   `enforceLogin(to)` is called by the global navigation guard for routes with
    `meta.requiresAuth`. It accepts the destination route directly. Initialization failures throw
    `OidcInitializationError`; the guard catches that type and redirects to the public
    `/authentication-error` page, which reads `initializationError` through `useOidc()`.
    Unexpected errors propagate to Vue Router's error handling.
-   `fetchWithAuth()` attaches a current access token to REST requests.
    `src/trpc.ts` obtains tokens through the same `getOidc()` for its header callback.

`src/pages/authenticated/` contains the protected pages. This folder is an
organizational convention; the route metadata and guard in `src/router.ts` enforce
authentication. The protected route group adds no layout. `src/App.vue` mounts
`AutoLogoutWarningOverlay` so it can display warnings on every page.
Home, authentication errors, and inactivity logout remain public, and the folder adds no URL segment.

`TodoListApi.vue` and `TodoListTrpc.vue` each contain their own loading and submission
code, so you can read either integration independently. The REST page types its JSON
response as `TodoItem[]`; the tRPC pages use the server router's inferred output types
through `RouterOutputs`. Each page loads its data on mount and reloads after a mutation.

Automatic logout preserves the current URL for the public inactivity page; its resume
link accepts only same-origin destinations.

## Backend and storage

`server/` follows the TanStack Router example. Express and tRPC share
`getUser(req)` and todo storage. Each operation validates authentication; admin
procedures also enforce authorization on the server. Browser runtime protection
and DPoP are enabled by the oidc-spa Vite plugin.

Todos are stored in local `todos_*.json` files, or in Upstash Redis when
`KV_REST_API_URL` and `KV_REST_API_TOKEN` are configured. There is no SSR. If you
already have a backend, replace these example API calls with your own.

## Build and run

```sh
yarn typecheck
yarn build
yarn start
```

The build produces static files in `dist/client` and a Node server in `dist/server`.
`build:client` builds the SPA; `build:server` bundles `server/index-node.ts`.
Express serves both the SPA, including deep links, and the APIs on port 3000. `PORT`
overrides the production port; `API_PORT` overrides the development API port. Update
the Vite proxy if you change `API_PORT`.

The production routing and browser cache policy are:

| Request                               | Response                       | Cache-Control                         |
| ------------------------------------- | ------------------------------ | ------------------------------------- |
| `/api` and `/api/*`, all HTTP methods | Express REST or tRPC handler   | `no-store`                            |
| `/assets/*`, GET/HEAD                 | File from `dist/client/assets` | `public, max-age=31536000, immutable` |
| Other existing static files, GET/HEAD | File from `dist/client`        | `no-cache`                            |
| Other page paths, GET/HEAD            | `dist/client/index.html`       | `no-cache`                            |

Vite gives generated assets content hashes in their filenames, so they can be cached
for a year: a changed file gets a new URL. `no-cache` allows storage but requires
revalidation before reuse. Missing files under `/assets/*` return 404 instead of
the SPA HTML. `/assets` is the namespace chosen for build assets; it can be changed
with Vite's `build.assetsDir` if it conflicts with your page URLs (update the server
and hosting rules too).

On a VM or in a container, run `npm start` as a persistent Node process and put a
reverse proxy in front of its `PORT`. You can proxy everything to Express, which
implements the table above, or serve `dist/client` through your web server/CDN and
proxy only `/api` and `/api/*` to Node. Proxy API requests internally, preserving
their method, body, original path, host and protocol; do not send a browser redirect.
The server build leaves npm dependencies external, so the Node deployment also needs
the production dependencies from `package.json`, plus its environment variables.

## Deploy on Vercel

1. Set the project root to `examples/vue`.
2. The committed `.env` supplies the demo provider defaults. Override provider
   variables in Vercel before building when needed. Register the deployed origin
   and redirect URL with your provider. Public settings are embedded at build time,
   so the frontend and backend must use matching provider settings.
3. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` for persistent todos; the deployed
   API cannot use local filesystem storage.
4. Deploy using the included `vercel.json`. Static files come from `dist/client`,
   `/api/*` requests go to the handler exported by `api/index-vercel.ts`, and other
   paths fall back to `index.html` for client routing.

Vercel uses two deployment conventions here:

-   `outputDirectory: "dist/client"` publishes that directory as static files on the
    CDN. `framework: "vite"` selects Vite build defaults; `buildCommand` runs the
    typecheck and client build. Vercel builds the function separately.
-   The source file `api/index-vercel.ts` is automatically compiled and packaged as a
    Node function at `/api/index-vercel`. Its default handler forwards requests to
    the shared Express app with `app(req, res)`, without calling `app.listen()`.
    Vercel invokes that handler for API requests; it does not run
    `npm start` or use `dist/server/index.mjs`.

Only the Vercel function entry lives under `api/`: Vercel treats supported files in
that directory as function entries. The shared application, authentication, tRPC,
storage, and regular Node entry stay under `server/`.

Vite loads `.env` during the frontend build. The function explicitly loads the same
file at runtime, using its own module location to resolve the path. The `functions`
configuration includes `.env` in the function package; values configured in Vercel
take precedence. The file is packaged with the backend, outside the static output.

The first rewrite dispatches `/api/*` to that function. The Express app receives
the original request path (for example `/api/todos`) and handles all API methods,
including POST. Existing static files take precedence over rewrites. The second
rewrite serves `index.html` for page URLs, excluding the API and asset namespaces.
The `headers` rules implement the cache policy in the table above. Static files
can still be cached in Vercel's CDN even when browsers must revalidate the HTML.

The function is compiled separately from the esbuild server bundle. Its relative
server imports therefore include `.js` extensions and explicit `/index.js` paths,
as required by Node's ESM loader. TypeScript resolves these to the corresponding
`.ts` source files during compilation. Extensionless imports can work in Vite,
tsx and esbuild while failing in the deployed function with `ERR_MODULE_NOT_FOUND`.

See Vercel's [Vite deployment guide](https://vercel.com/docs/frameworks/frontend/vite),
[Node function conventions](https://vercel.com/docs/functions/runtimes/node-js), and
[project configuration reference](https://vercel.com/docs/project-configuration/vercel-json).
