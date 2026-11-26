# Self-hosting with SSR

This target runs one Node container. Nitro serves browser assets, renders public pages on each
request, and handles API routes and server functions. It uses `spa.enabled: false` and disables
build-time prerendering. There is no `_shell.html`, SPA fallback, or separate Nginx frontend.
The authenticated routes keep their existing `ssr: false` setting and render their protected UI
in the browser.

## Build and run

Make sure `STATIC_FRONTEND` in [`../vite.config.ts`](../vite.config.ts) is set to `false` before
building. This selects SSR and writes its build output into this directory.

Run these commands from `examples/tanstack-start/self-hosted-ssr`, with Node dependencies installed
in the parent example and Docker running:

```sh
npm --prefix .. run build:self-hosted
docker compose up --build
```

Compose runs in the foreground and streams the application logs. Keep this terminal open;
press `Ctrl+C` to stop the application containers.

Open <http://app.localhost:3000>. Register
`http://app.localhost:3000/openid-callback/` as the redirect URI in your IAM console.
Stop any other server using port 3000 first, or select another port:

```sh
SELF_HOSTED_PORT=3001 docker compose up --build
```

Register the corresponding redirect URI when changing the origin. `localhost` also works for
providers that allow it; `app.localhost` is useful for Auth0.

The build writes the standalone backend to `.output/server/` and assets to `.output/public/`
inside this directory. The Dockerfile packages both directories without running an install or
build inside Docker. It does not copy source files or `.env` into the image.

Both self-hosted variants use the same `build:self-hosted` script. `STATIC_FRONTEND` chooses which
variant is built; it does not build both at once. The other deployment targets keep their own
output directories, and building does not require Docker.
To try SSR during development, keep `STATIC_FRONTEND = false` and run `npm --prefix .. run dev`.

## Callbacks and routing

The oidc-spa plugin wraps Start's server entry with `withOidcSpaServerEntry`. An authentication
response uses query parameters so the server can inspect `state` and the corresponding routing
cookie. It internally renders the saved return URL while preserving the callback URL in the
browser; client initialization then completes authentication. An expired transaction falls back
to the application's home page.

Unlike the [static frontend target](../self-hosted-static-frontend/README.md), there is no callback
rewrite to a shell. Nitro and Start handle document requests normally, including not-found pages.
A bare callback URL without an authorization response is not an application page and can redirect
to its slashless form before returning 404.

## Runtime configuration and persistence

Compose loads the example's `../.env` into the container at startup. To choose a different file:

```sh
SELF_HOSTED_ENV_FILE=../.env.production docker compose up --build
```

Environment file paths are relative to `self-hosted-ssr/compose.yaml`; absolute paths also work.
Use the same selection when recreating the container. Provider settings are read at runtime.
Stop Compose with `Ctrl+C`, then recreate the container to load new values without rebuilding:

```sh
SELF_HOSTED_ENV_FILE=../.env.production docker compose up --force-recreate
```

For a trial without an identity provider, select a file containing `OIDC_PROVIDER=mock`. Mock mode
starts with a signed-in mock admin user. Use a real provider for a public deployment.

The app runs as the unprivileged `node` user with `/data` as its working directory. The named
`todos` volume persists filesystem todos across container replacements. It is separate from the
static target's volume. `docker compose down` retains it; `down --volumes` removes its data.
For multiple app replicas, use the shared Redis store by setting `KV_REST_API_URL` and
`KV_REST_API_TOKEN` in the runtime environment.

## Verify and manage

Run these checks in another terminal, from the same directory, while Compose stays attached in
the original terminal:

```sh
docker compose ps
curl -i http://localhost:3000/
curl -i http://localhost:3000/a-page-that-does-not-exist
curl -i http://localhost:3000/api/todos
docker compose logs -f
```

The home response contains its rendered heading. An unknown page returns 404. With a real provider,
the unauthenticated API request returns 401; in mock mode it returns todos. Sign in and try both
todo pages to verify authenticated API calls and server functions, including writes.

After application changes, stop Compose with `Ctrl+C`, keep `STATIC_FRONTEND = false`, and rebuild
the image and container:

```sh
npm --prefix .. run build:self-hosted
docker compose up --build
```

Press `Ctrl+C` in the Compose terminal to stop the app. To also remove the container and network:

```sh
docker compose down
```

For deployment, tag and push `oidc-spa-tanstack-start-ssr:local` to your image registry. Configure
HTTPS through your hosting platform or ingress, including its forwarded headers and the runtime's
proxy trust configuration for the public origin. Register the public `/openid-callback/` URL and
the provider's applicable allowed origins and logout URLs.

Hosting the app on the same site as the authorization server helps session restoration avoid
redirects and flashes. Microsoft Entra ID is an exception because its authorization endpoint is
fixed. Keep the API registration and required scopes for the selected provider; backend access-token
validation applies to both hosting variants.
