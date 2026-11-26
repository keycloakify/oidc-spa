# Angular + Express example

An Angular port of `examples/tanstack-start` and `examples/next`, with the same pages, user profiles,
provider choices, dark styling and todo storage. Angular calls an ordinary Express REST API using
`HttpClient`; frontend response types are declared independently of the backend.

The Angular integration can be used with an existing, independently maintained API. The Express
backend is included to make this demo runnable and illustrate token validation with `oidc-spa/server`.
Your backend can use its own authentication implementation.

The application renders entirely in the browser. Angular renders the public shell while OIDC
initializes. The header waits for `isOidcReady` before showing authentication controls.

## Development

Use Node.js 24 LTS, or a version supported by `package.json`.

From the repository root, build oidc-spa and start the Angular example:

```sh
yarn install
yarn start-angular-example
```

The repository command builds oidc-spa and copies the workspace build into the example. To use the
published `oidc-spa@next` package instead, run `yarn install` and `yarn dev` from `examples/angular`.

Open <http://app.localhost:3000>. npm and pnpm work too. The development command starts Angular CLI on
port 3000 and Express on port 3001. Angular proxies `/api/**` to Express, so browser requests use the
same origin. Keep port 3000 free when running this example.

In the tracked `.env` file, choose `OIDC_PROVIDER` and configure the matching variables:
`Keycloak`, `Keycloak2` (introspection), `Auth0`, `EntraID`, or `mock`.
`OIDC_PROVIDER=mock` starts with a signed-in mock admin without an identity provider. Mock mode is only
for development.

Restart the server and reload the page after changing providers. Settings are loaded at runtime,
including in production; changing providers does not require rebuilding Angular. Both server entry
points load the committed `.env`; existing environment variables take precedence over the file.
The OIDC client must allow <http://app.localhost:3000> as an application origin and
`http://app.localhost:3000/openid-callback/` as the redirect destination.

## Pages

- Home: `/` — a public integration walkthrough.
- Todo List: `/todo-list` — view and add your own todos.
- Todo List Admin: `/todo-list-admin` — view todos grouped by user ID and delete items as an admin.
- Account: `/account` — profile and Keycloak account actions, accessible from the avatar.
- Inactivity logout: `/inactivity-logout` — a public message with a link to resume the previous page.

## Integration

### Angular

- `src/main.earlyInit.ts` calls `oidcEarlyInit()` with browser runtime freezing and DPoP enabled,
  then dynamically imports `src/main.ts` to bootstrap Angular.
- `src/app/oidc.ts` defines `User_client` with `withUser()`, exports the Angular utilities and
  declares the `REQUIRE_ACCESS_TOKEN` context token. Components read the profile through the
  `user()` signal returned by `injectOidc()`.
- `src/app/components/app-header/app-header.ts` keeps navigation visible during initialization. Once
  `isOidcReady` is true, it uses `isUserLoggedIn` to choose between the profile and logout controls
  or login and registration.
- `src/app/app.config.ts` registers `provideOidc()` and `createOidcInterceptor()`. The interceptor
  attaches an access token only when a request sets `REQUIRE_ACCESS_TOKEN`.
- `enforceLoginGuard` throws the original `OidcInitializationError` when authentication cannot be
  initialized. `withNavigationErrorHandler()` in `src/app/app.config.ts` displays an alert with
  the error message and redirects home. Other navigation errors retain Angular's normal handling.
- `src/app/app.routes.ts` groups the todo, admin and account pages under a parent with
  `canActivateChild: [enforceLoginGuard]`. Their routes live in
  `src/app/pages/protected/protected.routes.ts` and inherit this guard without changing their URLs.
  The admin route also checks `canSeeAdminNavigation` in `canActivate`; non-admin users see an alert
  and are redirected home before the page loads.
- The root component in `src/app/app.ts` mounts `AutoLogoutWarningOverlay` whenever the user is
  signed in, so the warning can appear on both public and protected pages.
- `autoLogout_returnToUrl` in `src/app/app.config.ts` sends users to `/inactivity-logout` after
  automatic logout, saving the previous URL in `return_url`. The resume link returns to that URL;
  the shared guard starts sign-in when needed.
- `src/app/services/todo.service.ts` uses `HttpClient` with
  `context: new HttpContext().set(REQUIRE_ACCESS_TOKEN, true)` on each protected request. The
  interceptor attaches a current access token when one is available. The API still handles
  authorization and returns its own HTTP response. Early initialization handles DPoP when supported
  by the provider.

`provideOidc()` accepts a configuration object, a synchronous getter, or an asynchronous getter.
For example, the configuration can be supplied directly:

```ts
provideOidc({
  mode: 'real',
  issuerUri: 'https://auth.example.com',
  clientId: 'my-app',
});
```

Use whichever configuration source suits your application: constants, Angular environment files,
or an existing configuration service. In this example, an async getter fetches public settings from
`/api/oidc-client-env` and builds the OIDC configuration in Angular. That endpoint is a convenience
for switching providers without rebuilding the frontend. Its response is an allowlist of public
environment values, rather than an oidc-spa configuration object. The request does not set
`REQUIRE_ACCESS_TOKEN`, so it can run before authentication is initialized.

### Express companion

- `server/app.ts` exports the shared Express application. `server/index-node.ts` starts the
  standalone server; `api/index-vercel.ts` exposes a request handler for Vercel without calling
  `app.listen()`.
- `server/oidc.ts` configures token validation independently through `.withRuntimeConfigs()`.
  `extractRequestAuthContext()` and `validateAndGetAccessTokenClaims()` from `oidc-spa/server`
  validate the request, then `getUser(req)` maps the claims to `User_server`: `id` and `isAdmin`.
  An optional `roles` array containing `admin` grants admin access. Introspection credentials stay
  on the server.
- `server/api.ts` authenticates personal todo requests and independently authorizes both admin
  endpoints. Authentication failures preserve oidc-spa's suggested HTTP status. Browser guards and
  navigation flags do not grant API access.

The browser and backend have independent user models and configuration. In an existing application,
the API must validate and authorize requests using its own backend stack; using `oidc-spa/angular`
does not require adopting `oidc-spa/server`.

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

`build:client` runs Angular CLI and writes the static SPA to `dist/client`. `build:server` typechecks
the backend and bundles `server/index-node.ts` into `dist/server/index.mjs`. `build` runs both.
Express serves the API and static SPA, including deep-link fallback, on port 3000. `PORT` overrides
the production port; `API_PORT` overrides the development API port (3001). No Angular server renderer
is involved. The server bundle leaves npm dependencies external, so a Node deployment also needs the
production dependencies from `package.json`.

Angular emits hashed JavaScript and CSS bundles at the client root, such as `/main-XXXXXXXX.js`,
`/chunk-XXXXXXXX.js`, and `/styles-XXXXXXXX.css`. CSS resources are emitted under `/assets/`.
Both the standalone server and Vercel use these cache policies:

| Request                                         | Response                                           | Cache-Control                         |
| ----------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| `/api` and `/api/*`, all HTTP methods           | Shared Express API, including public OIDC settings | `no-store`                            |
| Hashed JS/CSS bundles and `/assets/*`, GET/HEAD | Static build files                                 | `public, max-age=31536000, immutable` |
| Other static files and page URLs, GET/HEAD      | Static file or SPA `index.html` fallback           | `no-cache`                            |

Changed build assets get new filenames, so they can be cached for a year. HTML requires revalidation
before reuse. Missing assets and hashed bundles return 404 instead of the SPA HTML. Public files such
as `favicon.ico` and `userPictureFallback.svg` keep their original names and require revalidation.

## Deploy on Vercel

1. Set the project root to `examples/angular`.
2. Use the committed `.env` for the demo provider defaults, or override settings in Vercel's
   environment variables. Register the deployed origin and redirect URL with the selected provider.
3. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` in Vercel for persistent todos; the deployed
   function cannot use local filesystem storage.
4. Deploy with the included `vercel.json`. It typechecks the application and builds only the client;
   Vercel compiles and packages `api/index-vercel.ts` separately as a Node function.

`outputDirectory: "dist/client"` publishes the Angular files to Vercel's CDN. The `/api/*` rewrite
dispatches requests to `/api/index-vercel`, preserving their original path and HTTP method. Other
page URLs fall back to `index.html`. Headers cover Angular's root-level hashed bundles as well as
`/assets/`, while API responses remain uncached.

The function explicitly loads `.env` relative to its own module, and `functions.includeFiles`
includes that file in the backend package. Vercel environment variables take precedence. Only the
function entry belongs under `api/`; shared backend modules stay under `server/`. Relative server
imports use `.js` extensions, which TypeScript resolves to `.ts` sources and Node resolves to the
compiled JavaScript. Vercel manages the HTTP server and does not run `npm start` or use
`dist/server/index.mjs`.

Unlike the Vite examples, Angular fetches its public OIDC settings from `/api/oidc-client-env` at
runtime. Provider settings are not embedded in the static frontend. Vercel environment changes or
changes to the packaged `.env` require a new deployment, but no Angular source changes.

The initial scaffold was generated with Angular CLI 22.2.4 using routing, CSS, `--ssr=false` and
`--minimal`. Third-party dependencies are pinned; `oidc-spa` follows the `next` release channel.
Lockfiles are ignored and no package manager is imposed.

See the [oidc-spa documentation](https://docs.oidc-spa.dev/) for more details.
