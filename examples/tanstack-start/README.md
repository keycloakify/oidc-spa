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
Register `http://app.localhost:3000/openid-callback/` as the redirect URI in your IAM console.
For an app hosted under `/dashboard/`, register `/dashboard/openid-callback/` on its origin.

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

Build all three deployment targets:

```sh
npm run build
```

Or build one target:

| Command                    | Static frontend         | Backend / deployment configuration                       |
| -------------------------- | ----------------------- | -------------------------------------------------------- |
| `npm run build:vercel`     | `.vercel/output/static` | `.vercel/output/functions`, `.vercel/output/config.json` |
| `npm run build:cloudflare` | `.output/public`        | `.output/server`, `.output/server/wrangler.json`         |
| `npm run build:netlify`    | `dist`                  | `.netlify/functions-internal`                            |

All three outputs remain available after `npm run build`. With newer Nitro versions, Netlify uses
`.netlify/v1/functions` instead.

For Vercel, import the repository with `examples/tanstack-start` as the project root and the TanStack
Start framework preset. `vercel.json` selects `npm run build:vercel`; it contains no routing rules.
For Cloudflare Workers, select `npm run build:cloudflare` as the build command and deploy with
`npx wrangler deploy`. You can preview the Cloudflare output locally with `npx wrangler dev`.
For Netlify, `netlify.toml` selects `npm run build:netlify` and `dist` as the publish directory.
Set the project base directory to `examples/tanstack-start`.

Cloudflare Workers Builds currently does not honor Wrangler's custom `build.command` setting, so
its hosted build command must be selected in the project's build settings. Nitro generates the
Wrangler deployment configuration automatically; no handwritten routing configuration is needed.

The `oidcSpa()` Vite plugin generates deployment routing only when Start emits `_shell.html`.
Existing static pages and assets are served directly, remaining page URLs use the shell, and
`/api/*` and `/_serverFn/*` remain dynamic. `/openid-callback/` receives the neutral shell for
both query and fragment responses, while the browser retains the callback URL. The home page
always receives its prerendered content, including when its query contains `state`.
These paths include the application's base path when configured with Vite's `base`.
SSR builds without a shell retain Nitro's normal routing. No application-level build hook is needed.

All three targets use native static routing; no callback edge function or generated Worker
dispatcher is needed. On Cloudflare, the native SPA fallback requires the shell at `/index.html`.
For an app at `/`, the plugin preserves the prerendered home as `_prerendered-index.html` and
adds a static home rewrite. Cloudflare's native fallback also returns the shell for missing asset
URLs. Its build-time preview receives Start's prerender flag so the shell is empty; the flag is
removed from the final preview command.

`useLegacyRedirectUri: true` preserves an existing IAM registration using the application's home
URL in integrations that support it. TanStack Start SPA deployments require the dedicated callback
path: update the IAM registration before upgrading this example. The build reports a migration
error if the legacy option is enabled in SPA mode.

No custom `src/server.ts` is required: Start's default server entry handles APIs, server functions,
and build-time prerendering. The oidc-spa plugin automatically wraps that entry with
`withOidcSpaServerEntry` for request-time SSR callbacks. Static callback routing runs at the CDN,
before that entry is invoked.

Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` in the deployment environment for persistent todos on
all three platforms. The filesystem store is for local Node development.
