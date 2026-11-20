# TanStack Start Example

A minimal TanStack Start v1 example:

-   Home: `/`
-   Todo List (Server Function): `/todo-list-server-function`
-   Todo List (API): `/todo-list-api`
-   Todo List Admin: `/todo-list-admin`
-   Account: `/account`
-   Inactivity logout: `/inactivity-logout`

Both todo pages load and add per-user todos using the same store. One uses server functions protected
by `oidcFnMiddleware`; the other calls the `/api/todos` GET/POST endpoint protected by
`oidcRequestMiddleware`. Both pages are linked from the home page and navigation.
Todo List Admin lets admins view todos grouped by user ID and delete individual items.
Account displays the user's profile and provides account management actions when using Keycloak.

The account and todo pages share the pathless `src/routes/_app/_authenticated/route.tsx` route, which
calls `enforceLogin` once for all its children. Their URLs do not include `_app` or `_authenticated`.
The home and inactivity logout pages remain public.

`src/routes/__root.tsx` contains only the HTML document, head, and bootstrap scripts.
The pathless `src/routes/_app/route.tsx` layout holds `AppHeader`, the page outlet, and
`AutoLogoutWarningOverlay` for every app page. Protected pages render on the client. After an
automatic logout, the inactivity page offers a link to resume the previous page, whose login
guard handles sign-in when needed.

## Development

From this directory:

```sh
yarn install
yarn dev
```

Open <http://app.localhost:3000>.

In the tracked `.env` file, choose `OIDC_PROVIDER` and configure the matching variables.
Set `OIDC_PROVIDER=mock` to try the example without an identity provider.

To run against the local oidc-spa source, run this from the repository root:

```sh
yarn start-tanstack-start-example
```

## Production

`SPA_MODE` in `vite.config.ts` defaults to `true`. Start automatically discovers and prerenders
static page paths and generates a separate `_shell.html`. No page list is needed. Public pages
contain their rendered content; protected page components inherit `ssr: false` and render on the
client. API routes are excluded from page discovery. Parameterized routes need concrete URLs,
either discovered by crawling links or supplied through Start's `pages` option.

The generic `_shell.html` contains no app UI. Start omits non-root route components when rendering
this shell, including the `_app` layout. Its header and page content mount on the client after
oidc-spa restores the return URL. Ordinary prerendered pages still include the shared layout,
and public pages include their content. No per-link hydration workaround is needed.

In development, public pages render on demand. Setting `SPA_MODE` to `false` restores
request-time document rendering.

```sh
yarn build
yarn start
```

This builds the default Nitro Node target. To generate the Vercel deployment artifact locally:

```sh
yarn build:vercel
```

Import the repository in Vercel with `examples/tanstack-start` as the project root and the TanStack
Start framework preset. Nitro detects Vercel during deployment and writes `.vercel/output`.
Nitro supplies the function, static-file routing, and immutable asset caching. The additions in
`vite.config.ts` set document/API cache headers, serve the shell on OIDC callbacks, and adapt
Nitro's default SSR fallback to Start's documented SPA routing:

| Request                                  | Destination                                       | Cache-Control                         |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| `/?state=…`                              | Static `_shell.html`, preserving the callback URL | `no-cache`                            |
| Discovered static page paths             | Prerendered HTML                                  | `no-cache`                            |
| `/api/*` and `/_serverFn/*`, all methods | Nitro server function                             | `no-store`                            |
| `/assets/*`                              | Static assets                                     | `public, max-age=31536000, immutable` |
| Other page URLs, GET/HEAD                | Static `_shell.html`                              | `no-cache`                            |

The callback rule runs before filesystem lookup so the prerendered home page cannot replace the
shell on an OIDC response. API and server-function requests bypass the document fallback.

No custom `src/server.ts` is required: Start's default server entry handles APIs, server functions,
and build-time prerendering. The oidc-spa plugin automatically wraps that entry with
`withOidcSpaServerEntry` for request-time SSR callbacks. Static callback routing runs at the CDN,
before that entry is invoked.

The installed Nitro Vercel preset routes all non-static requests to SSR by default. The build hook
keeps its generated routing and changes only that final fallback: APIs and server functions go to
the runtime; other GET/HEAD requests use `_shell.html`. Other hosting targets need equivalent SPA
fallback routing if documents should be served entirely from static files.

Use `KV_REST_API_URL` and `KV_REST_API_TOKEN` for persistent todos on Vercel. The filesystem store is
for local development.
