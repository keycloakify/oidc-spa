# Next.js example

A minimal Next.js App Router port of `examples/tanstack-start`, with the same user models,
provider choices, dark styling, and todo storage. The todo list has two implementations: tRPC and
Next.js Route Handlers with ordinary `fetch`.

Next.js renders public content on the server, with a backend in the same project. Authentication and
session restoration happen in the browser. Initialization gates surround the authentication-dependent
header controls and protected pages, so public content can render immediately. Page rendering on the
server has no access to that browser session; authenticated data is loaded through browser requests
to the backend.

Browser authentication and backend token validation are configured independently. The included backend
uses `oidc-spa/server`, but the browser integration can also call an existing API with its own token
validation implementation.

## Pages

-   Home: `/` — a public integration walkthrough.
-   Todo List (tRPC): `/todo-list-trpc` — view and add your own todos with tRPC.
-   Todo List (API): `/todo-list-api` — the same todos using `fetch` and Next.js Route Handlers.
-   Todo List Admin: `/todo-list-admin` — view todos grouped by user ID and delete items as an admin.
-   Account: `/account` — profile and Keycloak account actions, accessible from the avatar.
-   Inactivity logout: `/inactivity-logout` — a public message with a link to resume the previous page.

## Development

Use Node.js 24 LTS (minimum 20.19).

```sh
yarn install
yarn dev
```

Open <http://app.localhost:3000>. npm and pnpm work too.
In the tracked `.env` file, choose `NEXT_PUBLIC_OIDC_PROVIDER` and configure the matching variables.
The options are `Keycloak`, `Keycloak2` (introspection), `Auth0`, `EntraID`, and `mock`. Set
`NEXT_PUBLIC_OIDC_PROVIDER=mock` to start as a signed-in mock admin without an identity provider.
Restart the dev server after changing these settings.

To use local oidc-spa source, run `yarn start-next-example` from the repository root.

## Integration

-   `next.config.ts` uses `withOidcSpa` from `oidc-spa/nextjs-plugin` to inject `oidcEarlyInit()`
    before React hydration, with DPoP and browser runtime freeze enabled. The plugin derives the
    initialization base URL from Next's `basePath` and excludes `Array` from freezing because Next
    modifies its RSC chunk queue. With a `basePath` and Next's default `trailingSlash: false`, it also
    disables automatic trailing-slash redirects to preserve the OIDC callback URL's required trailing
    slash. This requires Next.js 16.3 or later; no `instrumentation-client.ts` file is needed.
-   The plugin generates and ignores `proxy.ts`, including its callback matcher, during development
    and production builds. No proxy file needs to be maintained in the example. The handler uses the matching
    OIDC state cookie to fetch the return destination and stream its response back, so Next renders
    both the page and its router state using the destination URL while the browser still receives
    the callback URL. This adds one server-side HTTP request per authentication callback. Early
    initialization consumes the callback and restores the destination before hydration. The cookie contains routing information, not
    credentials; this proxy does not authenticate requests.
-   `lib/oidc.tsx` uses `oidc-spa/nextjs` to define `User_client` with `withUser()`, configure
    providers with `withRuntimeConfigs()`, and export typed hooks and App Router login helpers.
-   `app/layout.tsx` renders the public layout without a root gate. `components/AppHeader.tsx`
    places gates around its auth controls and admin navigation. Active links use ordinary
    `usePathname()`, with matching server and client values when returning from authentication.
-   `app/(protected)/layout.tsx` places an `OidcInitializationGate` around `withLoginEnforced` to
    require sign-in for the todo, admin, and account pages. This keeps components using `useOidc()`
    on the client. The home and inactivity logout pages remain outside these gates.
-   `autoLogout_returnToUrl` in `lib/oidc.tsx` sends users to `/inactivity-logout` after automatic
    logout, saving their previous URL in `return_url`. The resume link returns to that URL;
    the protected layout starts sign-in when needed.
-   `lib/trpc.ts` sends access tokens in the Authorization header using `getOidc()`.
-   `lib/server/oidc.ts` configures token validation separately with `oidc-spa/server`. Its
    `AccessTokenClaims` schema describes the expected claims, which `getUser(req)` maps to its own
    `User_server` model. Both user models match the TanStack Start example. The optional `roles` array grants admin access
    when it contains `admin`. Authentication failures throw a transport-neutral `AuthError` with an
    HTTP status; token validation failures preserve the status suggested by oidc-spa.
    `extractRequestAuthContext` handles Next's removal of `basePath` from Route Handler requests
    when reconstructing the public URL for DPoP validation.
-   `lib/server/trpc.ts` provides authenticated `todos.list` / `todos.add` procedures and admin-only
    `todos.listAllUserTodos` / `todos.delete` procedures. Each handler passes `ctx.req` to `getUser(req)`;
    oidc-spa shares validation within each request, including batches. Both admin procedures check
    `user.isAdmin` independently. Its local `getUser` wrapper translates shared authentication errors
    into `TRPCError`.
-   `app/api/todos/route.ts` exports authenticated `GET` and `POST` handlers using the same `getUser`
    helper (`getUser(req)`) and `lib/server/data` store. `app/(protected)/todo-list-api/page.tsx` calls
    them with `fetch` and an Authorization header. Authentication failures return the corresponding HTTP status;
    invalid todo input returns 400. Both todo pages share the same data.

Browser login guards and admin navigation are UI concerns; the API validates and authorizes every
request independently. `server-only` marks backend modules to prevent accidental client imports.

### Using an existing proxy

Rename an existing `proxy.ts` to `my-proxy.ts`, keeping its handler and literal `config` export in
that file. Reference it from the plugin options:

```ts
export default withOidcSpa(nextConfig, {
    proxy: "./my-proxy.ts",
    browserRuntimeFreeze: { enabled: true },
    DPoP: { enabled: true, mode: "auto" }
});
```

The plugin accepts a named `proxy` export or a default export. It reads the custom module's matcher
and regions, then generates the combined proxy configuration. On callbacks, the forwarded destination
request runs the custom proxy once, when its original matcher applies. Next handles its redirects,
rewrites, direct responses, headers, cookies, and request-header overrides normally. The outer callback
response is private and is not cached.

Custom handler edits reload normally, and matcher edits regenerate the proxy during development.
User-owned proxy and middleware files are never overwritten. Generated files are written only when
their content changes and their paths are added to `.gitignore` and `.prettierignore`. Their header
explains how to configure a custom proxy and disables ESLint, TypeScript checking, and IDE inspections.
Source generation does not run
during `next start`. For projects under `src`, the generated proxy is placed there; custom
`pageExtensions` are respected. If Next is invoked from outside the app directory, set `projectRoot`
in the plugin options to the app directory.

`withRuntimeConfigs()` accepts a configuration object, a synchronous getter, or an asynchronous
getter. Supply settings from whichever source suits your application. This example uses environment
variables in `lib/oidc.tsx` for browser settings and `lib/server/oidc.ts` for server validation. The
browser's `User_client` and backend's `User_server` are defined independently in those files.

Next.js embeds this example's `NEXT_PUBLIC_*` variables during `next build`. Configure them before
building; changing public provider settings in production requires a rebuild. Server-only variables, including
introspection credentials, stay on the server. Provider selection is split between browser and backend
configuration, while pages and tRPC procedures remain provider-independent.

Storage is the same as in the TanStack Start example: ignored `todos_*.json` files locally, or Upstash
Redis when both `KV_REST_API_URL` and `KV_REST_API_TOKEN` are configured. Use Redis on deployments without
persistent writable storage. Todo items have a numeric `id` and a `name`; only admins can delete items.

See the [oidc-spa documentation](https://docs.oidc-spa.dev/) for more details.

## Checks and production

```sh
yarn typecheck
yarn lint
yarn build
yarn start
```

Direct dependencies, including the oidc-spa v11 release candidate, are pinned.
No lockfile or package manager is imposed.
