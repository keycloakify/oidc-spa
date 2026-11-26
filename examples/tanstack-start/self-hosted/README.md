# Self-hosting with Docker Compose

This target uses two images: Nginx serves the prerendered frontend, and Nitro's standalone Node
server handles API routes and server functions. Frontend requests never fall through to Node,
so serving a page does not perform request-time SSR. A CDN can sit in front of Nginx; Compose
itself does not provide a CDN.

## Build and run

Run these commands from `examples/tanstack-start`, with Node dependencies installed and Docker
running:

```sh
npm run build:self-hosted
docker compose up --build -d
```

Open <http://app.localhost:3000>. The default port and hostname match the development example, so
the IAM redirect URI is still `http://app.localhost:3000/openid-callback/`.
Stop any development or preview server using port 3000 first. To select another port:

```sh
SELF_HOSTED_PORT=3001 docker compose up --build -d
```

Register the corresponding redirect URI in your IAM console when changing the origin.
`localhost` also works for providers that allow it; the `app.localhost` hostname is useful for Auth0.

The build produces independent directories:

| Path                             | Contents                                                    |
| -------------------------------- | ----------------------------------------------------------- |
| `self-hosted/.output/public/`    | Prerendered pages, `_shell.html`, and browser assets        |
| `self-hosted/.output/server/`    | Standalone Node backend, including its bundled dependencies |
| `self-hosted/.output/nitro.json` | Nitro build metadata                                        |

The other deployment targets keep their own output directories. `npm run build` builds all four
targets without requiring Docker; Docker is only needed to package and run the self-hosted output.

The Dockerfile packages these existing build artifacts. It does not install packages or run the
application build. Run `npm run build:self-hosted` again after changing application code, then
`docker compose up --build -d` to update both containers.

## Routing

All routing lives in [nginx.conf](nginx.conf), shared by every deployment of the frontend image.
The official Nginx entrypoint fills in the container's DNS resolvers when it starts. Nginx
re-resolves the backend service name as containers are replaced.
The current configuration serves this example at the origin root (`base: "/"`). If you change
the application's base path, update the Nginx paths and static-file layout to match.

| Request                                        | Result                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/` and other prerendered pages                | Static HTML, including the public page's rendered content                                  |
| `/openid-callback/`                            | Neutral `_shell.html`, without a browser redirect or trailing-slash change                 |
| Other frontend paths                           | `_shell.html`; the client router handles the page or its not-found UI                      |
| `/assets/*`                                    | Static assets with immutable caching; missing assets return 404                            |
| `/api`, `/api/*`, `/_serverFn`, `/_serverFn/*` | Proxied to the Node backend with method, body, query, and authentication headers preserved |

The callback works with both query and fragment responses. Fragments remain in the browser;
Nginx only needs to match the callback path. HTML is revalidated, the shell is not cached, and
content-hashed Vite assets can be cached for a year. Backend responses retain their own cache policy.

The `oidcSpa()` Vite plugin automatically prepares static SPA documents for Nitro's `node-server`
preset, including the marker used by its browser bootstrap. No example-specific post-build script
is needed. Builds without `_shell.html` retain normal SSR behavior.

## Runtime configuration and data

Compose passes the example's `.env` to the backend at container startup. The browser obtains its
public OIDC configuration through a server function; `.env` is not copied into either image.
For a deployment-specific file, use:

```sh
SELF_HOSTED_ENV_FILE=.env.production docker compose up --build -d
```

Use the same selection when recreating containers. Provider settings can change without rebuilding
the images; recreate the backend to load the new values:

```sh
SELF_HOSTED_ENV_FILE=.env.production docker compose up -d --force-recreate backend
```

Without `KV_REST_API_URL` and `KV_REST_API_TOKEN`, the example saves todos in the named `todos`
volume mounted at `/data`. The backend runs as the unprivileged `node` user, with `/data` as its
working directory. The volume survives container replacement and `docker compose down`.
`docker compose down --volumes` removes it and its todos.

This filesystem store is a simple single-backend example. For multiple backend replicas, use the
existing shared Redis store by setting both KV variables. Only Nginx publishes a host port; Node
is reachable through the Compose network.

For a quick trial without an identity provider, create an environment file containing
`OIDC_PROVIDER=mock` and select it with `SELF_HOSTED_ENV_FILE`. Mock mode starts with a signed-in
mock admin user; use a real provider for a public deployment.

## Verify the deployment

```sh
docker compose ps
curl -i http://localhost:3000/
curl -i 'http://localhost:3000/openid-callback/?state=example&code=example'
curl -i http://localhost:3000/a-page-that-does-not-exist
curl -i http://localhost:3000/assets/a-file-that-does-not-exist.js
curl -i http://localhost:3000/api/todos
```

The home response contains the prerendered heading. The callback and unknown page return the
neutral shell with status 200 and no `Location` header; an unknown asset returns 404. With a real
provider selected, `/api/todos` returns 401 without an access token. In mock mode it returns todos.
Sign in through the browser and try both todo pages to exercise authenticated API calls and server
functions, including writes.

To verify that page delivery does not depend on Node:

```sh
docker compose stop backend
curl -i http://localhost:3000/
curl -i http://localhost:3000/openid-callback/
docker compose start backend
```

Those HTML responses still work. Runtime configuration and authenticated operations need the
backend, so this check verifies document delivery rather than full browser functionality.

Inspect logs or stop the deployment with:

```sh
docker compose logs -f
docker compose down
```

## Deploy the images

Compose builds `oidc-spa-tanstack-start-frontend:local` and
`oidc-spa-tanstack-start-backend:local`. You can tag and push those images to your registry and
run them on a Docker host. The frontend expects the backend's network name to be `backend`, on
port 3000. Both images can also be reused by a future Helm chart.

Terminate HTTPS at your ingress, reverse proxy, or CDN. Preserve the public `Host` header and
overwrite `X-Forwarded-Proto` with the original request scheme; Nginx forwards these to Node.
Register `https://your-app.example/openid-callback/` with your identity provider and configure its
allowed origins and logout URLs as applicable. If adding CDN caching, keep the backend paths
uncached and preserve the callback's no-store policy.

Hosting the app on the same site as the authorization server helps session restoration avoid
redirects and flashes. Microsoft Entra ID is an exception because its authorization endpoint is
fixed. Keep the existing API registration and scope configuration for the selected provider;
changing hosting does not replace backend access-token validation.
