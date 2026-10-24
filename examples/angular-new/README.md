# Angular + Express example

An Angular port of `examples/tanstack-start` and `examples/next`, with the same pages, user profiles,
provider choices, dark styling and todo storage. Angular calls an ordinary Express REST API using
`HttpClient`; frontend response types are declared independently of the backend.

The application renders entirely in the browser. OIDC initialization completes before Angular renders
the application, using the adapter's default behavior. There is no SSR or `withNonBlockingRendering()`.

## Development

Use Node.js 24 LTS, or a version supported by `package.json`.

```sh
yarn install
yarn dev
```

Open <http://app.localhost:3000>. npm and pnpm work too. The development command starts Angular CLI on
port 3000 and Express on port 3001. Angular proxies `/api/**` to Express, so browser requests use the
same origin. Keep port 3000 free when running this example.

Installation creates `.env` from `.env.sample` if it does not exist. Choose `OIDC_PROVIDER` and configure
the matching variables: `Keycloak`, `Keycloak2` (introspection), `Auth0`, `EntraID`, or `mock`.
`OIDC_PROVIDER=mock` starts with a signed-in mock admin without an identity provider. Mock mode is only
for development.

Restart the server and reload the page after changing providers. Settings are loaded at runtime,
including in production; changing providers does not require rebuilding Angular. The OIDC client must
allow <http://app.localhost:3000> as an application origin and redirect destination.

To use the local oidc-spa source, run `yarn start-angular-new-example` from the repository root.

## Pages

- Home: `/` — a public integration walkthrough.
- Todo List: `/todo-list` — view and add your own todos.
- Todo List Admin: `/todo-list-admin` — view todos grouped by user ID and delete items as an admin.
- Account: `/account` — profile and Keycloak account actions, accessible from the avatar.

## Integration

- `src/main.ts` calls `oidcEarlyInit()` before dynamically loading the Angular application, with
  browser runtime freezing and DPoP enabled.
- `src/app/services/oidc.service.ts` defines the browser's user with `withUser()`, exports the Angular
  utilities and declares the `REQUIRE_ACCESS_TOKEN` context token.
- `src/app/app.config.ts` registers `provideOidc()` and `createOidcInterceptor()`. Initialization loads
  the public configuration from `/api/oidc-config` before rendering. The configuration request does
  not set `REQUIRE_ACCESS_TOKEN`, so it can run before authentication is initialized.
- `src/app/app.routes.ts` protects the todo, admin and account pages with `enforceLoginGuard`.
- `src/app/services/todo.service.ts` uses `HttpClient` with
  `context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true)` on each protected request. The
  interceptor gets a current access token and attaches it; early initialization handles DPoP when
  supported by the provider.
- `server/config.ts` selects public client settings and private server validation settings from the
  environment. Only its `client` section is returned by `/api/oidc-config`; introspection credentials
  remain on the server.
- `server/auth.ts` validates requests with `extractRequestAuthContext()` and
  `validateAndGetAccessTokenClaims()` from `oidc-spa/server`. The backend user has `id` and `isAdmin`,
  while the browser profile has a display name, email, avatar and admin navigation flag. An optional
  `roles` array containing `admin` grants admin access, matching the other examples.
- `server/api.ts` authenticates personal todo requests and independently authorizes both admin
  endpoints. Authentication failures preserve oidc-spa's suggested HTTP status. Browser guards and
  navigation flags do not grant API access.

The API has four protected operations:

| Method | Path                         | Access                                             |
| ------ | ---------------------------- | -------------------------------------------------- |
| GET    | `/api/todos`                 | Read the authenticated user's todos                |
| POST   | `/api/todos`                 | Add a todo with JSON `{ "name": "Get groceries" }` |
| GET    | `/api/todos/all`             | Admin: list all todos grouped by user ID           |
| DELETE | `/api/todos/:userId/:todoId` | Admin: delete a user's todo                        |

`server/data/todos` is copied unchanged from the TanStack Start example. It stores ignored
`todos_*.json` files locally, or uses Upstash Redis when both `KV_REST_API_URL` and `KV_REST_API_TOKEN`
are configured. Use Redis on deployments without persistent writable storage. Todo items have a
numeric `id` and a `name`; only admins can delete them.

The development proxy forwards the original host and protocol, which token validation needs for DPoP.
The auth helper uses `trustProxy: true`; deployed reverse proxies must overwrite forwarded headers
with the actual public request host and protocol.

## Checks and production

```sh
yarn typecheck
yarn format:check
yarn build
yarn start
```

The build produces static Angular files and a Node server in `dist/angular-new`. Express serves both
the API and the static SPA, including deep-link fallback, on port 3000. `PORT` overrides the production
port; `API_PORT` overrides the development API port (3001). No Angular server renderer is involved.

The initial scaffold was generated with Angular CLI 22.2.4 using routing, CSS, `--ssr=false` and
`--minimal`. Direct dependencies are pinned; lockfiles are ignored and no package manager is imposed.

See the [oidc-spa documentation](https://docs.oidc-spa.dev/) for more details.
