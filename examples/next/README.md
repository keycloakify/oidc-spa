# Next.js example

A minimal Next.js App Router port of `examples/tanstack-start`, with the same user models,
provider choices, dark styling, and todo storage. The todo list has two implementations: tRPC and
Next.js Route Handlers with ordinary `fetch`.

Next.js acts as a SPA framework with a backend in the same project. Authentication and session
restoration happen in the browser, and the entire UI waits for them before rendering. Page rendering
on the server has no access to that browser session; authenticated data is loaded through browser
requests to the backend.

## Pages

-   Home: `/` — a public integration walkthrough.
-   Todo List (tRPC): `/todo-list-trpc` — view and add your own todos with tRPC.
-   Todo List (API): `/todo-list-api` — the same todos using `fetch` and Next.js Route Handlers.
-   Todo List Admin: `/todo-list-admin` — view todos grouped by user ID and delete items as an admin.
-   Account: `/account` — profile and Keycloak account actions, accessible from the avatar.

## Development

Use Node.js 24 LTS (minimum 20.19).

```sh
yarn install
yarn dev
```

Open <http://app.localhost:3000>. npm and pnpm work too.
Installation creates `.env.local` from `.env.local.sample` if it does not exist.
If upgrading an older copy of this example, update your existing `.env.local` to match the new sample.

Choose `NEXT_PUBLIC_OIDC_PROVIDER` and configure the matching variables. The options are `Keycloak`,
`Keycloak2` (introspection), `Auth0`, `EntraID`, and `mock`. Set
`NEXT_PUBLIC_OIDC_PROVIDER=mock` to start as a signed-in mock admin without an identity provider.
Restart the dev server after changing these settings.

To use local oidc-spa source, run `yarn start-next-example` from the repository root.

## Integration

-   `instrumentation-client.ts` calls `oidcEarlyInit()` before the app becomes interactive, with DPoP
    enabled.
-   `lib/oidc.tsx` uses `oidc-spa/react-nextjs` to define `User_client` with `withUser()`, configure
    providers with `withRuntimeConfigs()`, and export typed hooks and App Router login helpers.
-   `app/layout.tsx` wraps the entire UI in one `OidcInitializationGate`: the header, all pages,
    and the session warning. It renders no application content until browser auth is ready.
-   `app/(protected)/layout.tsx` uses `withLoginEnforced` to require sign-in for the todo, admin,
    and account pages. The home page is public and uses the same root initialization gate.
-   `lib/trpc.ts` sends access tokens in the Authorization header using `getOidc()`.
-   `lib/server/auth.ts` validates tokens with `oidc-spa/server`, then maps claims to `User_server`.
    Both user models match the TanStack Start example. The optional `roles` array grants admin access
    when it contains `admin`. Authentication failures throw a transport-neutral `AuthError` with an
    HTTP status; token validation failures preserve the status suggested by oidc-spa.
-   `lib/server/trpc.ts` provides authenticated `todos.list` / `todos.add` procedures and admin-only
    `todos.listAllUserTodos` / `todos.delete` procedures. Each handler calls `getUser(ctx)` directly;
    oidc-spa shares validation within each request, including batches. Both admin procedures check
    `user.isAdmin` independently. Its local `getUser` wrapper translates shared authentication errors
    into `TRPCError`.
-   `app/api/todos/route.ts` exports authenticated `GET` and `POST` handlers using the same `getUser`
    helper and `lib/server/data` store. `app/(protected)/todo-list-api/page.tsx` calls them with `fetch`
    and an Authorization header. Authentication failures return the corresponding HTTP status;
    invalid todo input returns 400. Both todo pages share the same data.

Browser login guards and admin navigation are UI concerns; the API validates and authorizes every
request independently. `server-only` marks backend modules to prevent accidental client imports.

Next.js embeds `NEXT_PUBLIC_*` variables during `next build`. Configure them before building;
changing public provider settings in production requires a rebuild. Server-only variables, including
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
