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

Start automatically discovers and prerenders static page paths and generates a separate
`_shell.html`. Public pages contain their rendered content; protected page components inherit
`ssr: false` and render on the client. API routes are excluded from page discovery.
Parameterized routes need concrete URLs, either discovered by crawling links or supplied through
Start's `pages` option. The distinct `spa.maskPath` works around
[Start issue #8741](https://github.com/TanStack/router/issues/8741), which otherwise prevents the
home page from being prerendered alongside the shell.

The generic `_shell.html` contains no app UI. Start omits non-root route components when rendering
this shell, including the `_app` layout. Its header and page content mount on the client after
oidc-spa restores the return URL. Ordinary prerendered pages still include the shared layout,
and public pages include their content. In development, public pages render on demand.

To generate the Vercel deployment artifact locally:

```sh
yarn build:vercel
```

Import the repository in Vercel with `examples/tanstack-start` as the project root and the TanStack
Start framework preset. Nitro detects Vercel during deployment and writes `.vercel/output`.

The `oidcSpa()` Vite plugin generates the complete SPA routing in
`.vercel/output/config.json`. Existing static files are served first, remaining page URLs use
`/_shell.html`, and `/api/*` and `/_serverFn/*` remain dynamic. No `vercel.json` is required.
Nitro supplies the backend function and immutable asset caching.

The plugin also adds a callback rule before filesystem lookup: GET/HEAD requests to `/` with a
`state` query value beginning with
`b2lkYy1zcGEu` use `/_shell.html`. This rule runs before filesystem lookup, preserving the callback
URL while preventing the prerendered home page from being served for an OIDC callback. Ordinary
`state` query values keep the normal home page. No application-level build hook is needed.

This automatic CDN callback rule currently supports Vercel and assumes the standard `_shell.html`
filename. The plugin adds it only when the build emits that shell. Other hosting targets need
equivalent callback and SPA fallback routing.

No custom `src/server.ts` is required: Start's default server entry handles APIs, server functions,
and build-time prerendering. The oidc-spa plugin automatically wraps that entry with
`withOidcSpaServerEntry` for request-time SSR callbacks. Static callback routing runs at the CDN,
before that entry is invoked.

`yarn build` still builds Nitro's default Node target, runnable with `yarn start`. The Vercel CDN
routing described above applies to the Vercel deployment; self-hosting needs equivalent static
routing in front of Node.

Use `KV_REST_API_URL` and `KV_REST_API_TOKEN` for persistent todos on Vercel. The filesystem store is
for local development.
