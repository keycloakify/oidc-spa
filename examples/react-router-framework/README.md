# oidc-spa + React Router framework mode

One todo app demonstrates three backend styles within React Router Framework mode:

| Page              | Client                                                      | Backend                              |
| ----------------- | ----------------------------------------------------------- | ------------------------------------ |
| `/todo-list`      | Native loader/action delegation and React Router forms      | Server loaders and actions           |
| `/todo-list-api`  | `clientLoader`, `fetchWithAuth`, and ordinary HTTP requests | JSON resource route at `/api/todos`  |
| `/todo-list-trpc` | `clientLoader` and the typed tRPC client                    | tRPC resource route at `/api/trpc/*` |

All three use the same user validation and todo store. Add a todo on one page and it appears on
the others. `/todo-list-admin` provides admin-only operations; `/account` shows the user profile;
`/` and `/inactivity-logout` are public pages.

## Run locally

Use Node.js 22.22+ and Yarn. From the repository root:

```sh
yarn
yarn start-react-router-framework-example
```

This builds and installs the workspace SDK, including its resource-route integration, then starts
React Router's development server. Open **http://app.localhost:3000**. Register
`http://app.localhost:3000/openid-callback/` as your IAM client's redirect URI.

Once the workspace SDK is installed, you can run `yarn dev` in this example directory directly.
One development server handles the static document shell, native data requests, and resource routes.

In the tracked `.env`, select `VITE_OIDC_PROVIDER`: `Keycloak`, `Keycloak2` (introspection), `Auth0`,
`EntraID`, or `mock`. Mock mode starts with a signed-in admin without an identity provider.
Public `VITE_*` values are embedded at build time: restart development or rebuild after changing
them. Server settings come from `process.env`; local development and `yarn start` load `.env`.
Introspection secrets and KV credentials have no public prefix and stay on the server.

For your own IAM, register the backend API and allow the browser client to request its scopes.
Configure the client scopes/audience in `app/oidc.ts` and matching validation settings in
`app/.server/oidc.ts`. Hosting the app on the same site as the authorization server helps session
restoration avoid redirects and flashes. Microsoft Entra ID is an exception because its
authorization endpoint is fixed.

## Authentication and navigation

`app/routes.ts` uses the official `@react-router/fs-routes` conventions to discover route modules
in `app/routes`. `_index.tsx` serves `/`; dots separate URL segments, and `$` matches a splat.
`routes.ts` also discovers pages inside `_auth/` and wraps them in its pathless `layout.tsx`,
which is registered once and excluded from child-route discovery.
Resource routes are discovered inside `app/routes/api` with an `/api` URL prefix.
Add a route file to register a page; there is no separate route list to maintain.

`app/oidc.ts` maps claims to `User_client` and configures the browser client. Public pages render
while OIDC initializes; the header checks `isOidcReady` before showing authentication controls.
The root mounts `AutoLogoutWarningOverlay`, and its `HydrateFallback` returns `null`.

The pathless protected layout uses `clientMiddleware` to await `enforceLogin(args)` before child
loaders/actions run. URLs do not include the `_auth` directory name. Each backend handler also
validates access tokens independently through `app/.server/oidc.ts`. Admin handlers additionally
check `user.isAdmin`.

The oidc-spa Vite plugin runs early initialization before application code, enables browser runtime
protection and DPoP, and leaves application scripts and preloads inactive in callback iframes when
`shouldLoadApp` is false.

`autoLogout_returnToUrl` preserves the current URL in the inactivity page's `return_url` parameter.
The resume link returns there, where the client guard requires login again.

## Three ways to load and change data

### Native loaders and actions

`app/routes/_auth/todo-list.tsx` exports server `loader` and `action` functions. Client wrappers
delegate through `args.serverLoader()` and `args.serverAction()`. The React Router form posts to the
action and automatically revalidates loader data.

`app/entry.client.tsx` uses `HydratedRouter`'s `unstable_fetch` to attach the access token to native
data requests. `getOidc()` waits for initialization when an initial request starts before OIDC is
ready. Route-discovery requests do not need authentication. Avoid native link data prefetching for
protected routes: browser-issued prefetches bypass this custom fetch.

### JSON resource routes

`app/routes/api/todos.ts` has a GET `loader` and POST `action`, with no React component. It reads
JSON, validates input with Zod, and returns ordinary JSON responses. It can be called by any HTTP
client; a form is not required.

`app/routes/_auth/todo-list-api.tsx` reads the API in its `clientLoader`. Its submit handler posts
JSON and revalidates through `useRevalidator()`. The `fetchWithAuth` helper in `app/oidc.ts` attaches
the access token to these requests.

### tRPC resource routes

`app/routes/api/trpc.$.ts` delegates GET and POST requests to tRPC's Fetch adapter.
`app/.server/trpc.ts` defines typed procedures; each authenticates the incoming `Request` and uses
the same store as the other handlers. Keeping the same request in the tRPC context also allows
OIDC validation to reuse a request's DPoP verification across batched procedures.

`app/trpc.ts` imports only the server router's type and attaches tokens through `httpBatchLink`'s
headers callback. `app/routes/_auth/todo-list-trpc.tsx` uses the typed client for queries and
mutations, then revalidates its client loader. React Router's custom fetch only handles native data
requests; the API helper and tRPC link authenticate their own requests.

## Static frontend and runtime backend

`react-router.config.ts` selects `ssr: "unstable_api-only"`. The frontend is built as a static SPA;
server loaders/actions and resource routes run on the backend. Request-time UI rendering is disabled.
The integration also supports `ssr: false` when using a separate backend. Full UI SSR is not supported
by this oidc-spa integration.

React Router 8.5's API-only handler rejects ordinary resource URLs, and `react-router-serve` only
forwards `.data` and manifest requests through its default API-only dispatch. The oidc-spa Vite
plugin adds a `fetch` export to the generated API-only server build. The built-in CLI accepts that
export and uses it to dispatch resource routes, native data requests, and route discovery to React
Router's handlers. Page requests receive the existing static HTML shell; no React rendering runs
per request. Framework middleware, HTTP methods, streaming, authentication errors, and resource
response headers remain native React Router behavior.

The plugin also installs resource routing during development. Applications keep the normal
`react-router-serve` command and do not need a custom server. This compatibility layer relies on
experimental API-only metadata and the CLI's `fetch` entry path; it is tested against the pinned
React Router version.

## Build and run

From this directory, after installing the workspace SDK:

```sh
yarn typecheck
yarn build
yarn start
```

`build/client` contains the static frontend. `build/server` contains the native React Router server
build, including the compiled resource routes. React Router removes server loaders/actions and
`.server` modules from the browser bundle.

`yarn start` uses the built-in `react-router-serve` on port 3000 (`PORT` overrides it):

| Request                                       | Handling                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| Resource routes, `*.data`, `/__manifest`      | Generated framework request handler                                     |
| Existing static files                         | Files from `build/client`                                               |
| `/assets/*`                                   | Content-hashed assets with immutable caching; missing assets return 404 |
| Other GET/HEAD page URLs, including callbacks | Static `index.html`, with revalidation                                  |

A reverse proxy or CDN can serve the client directory and proxy only backend requests. Preserve
methods, bodies, query strings, public host/protocol, and authentication headers. Configure a trusted
proxy to overwrite forwarded headers rather than accepting client-supplied values.

Todos use local `todos_*.json` files, or Upstash Redis when `KV_REST_API_URL` and `KV_REST_API_TOKEN`
are set. Use shared storage for multiple backend instances.

## Deploy on Vercel

1. Set the project root to `examples/react-router-framework`.
2. Configure matching frontend and backend provider environment variables before building, and
   register the deployment's `/openid-callback/` URL in your IAM client.
3. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` for persistent storage; function filesystem writes
   cannot provide the example's todo persistence.
4. Deploy with `vercel.json`. Static pages/assets come from `build/client`. `/api/*`, `.data`, and
   route-discovery requests go to `api/index.js`, preserving the original request URL and body.

Vercel serves existing prerendered files before applying the frontend fallback. The home page uses
`index.html`, and `/inactivity-logout` uses its own prerendered HTML. `/openid-callback/` and frontend
paths without a static page use the clean `__spa-fallback.html` shell. Missing assets and API paths
are excluded from the frontend fallback. This configuration assumes `/` remains in the prerender
list; if it is removed, React Router writes the fallback to `index.html` instead, and the frontend
rewrite destination must be updated accordingly.

The function and built-in Node server use the generated `fetch` handler. Vercel invokes the function
rather than running `yarn start`. The function's public origin is recovered through Vercel's trusted proxy headers.
Native forms, JSON requests, and tRPC calls all reach the same framework resource/data handlers.
