# TanStack Start: prerendered frontend

**Register `https://your-app.example/openid-callback/` as the redirect URI in your identity
provider. Unlike the [standard SSR example](../tanstack-start/README.md), this example uses
`/openid-callback/`, rather than the application's home URL.** For local development, register
`http://app.localhost:3000/openid-callback/`.

Include the application's deployment base in this URL. For example, with Vite's `base` set to
`"/dashboard/"` and the app hosted at `https://mycompany.com/dashboard/`, register
`https://mycompany.com/dashboard/openid-callback/`. Keep `redirectUriPath: "/openid-callback/"`;
it is relative to Vite's `base`.

Start with the [reference example's README](../tanstack-start/README.md) for installation,
provider configuration, API authorization, and the todo app. This README covers only the changes
needed to prerender the frontend and serve it through a CDN. The dependency versions are identical. See the
[reference live demo](https://tanstack-start.oidc-spa.dev/) for the app itself.

To run against the current repository source, run
`npm run start-tanstack-start-prerendered-example` from the repository root.

## What changes

-   `vite.config.ts` enables `prerender.enabled` and `spa.enabled`. Start renders public pages at
    build time and generates `_shell.html` for client-rendered routes and frontend misses.
    `spa.maskPath` distinguishes the shell render from the home render to work around
    [TanStack Start issue #8741](https://github.com/TanStack/router/issues/8741).
-   `oidcSpa({ enableRoutingCookie: false, redirectUriPath: "/openid-callback/" })` disables the
    cookie used to coordinate request-time SSR and selects a dedicated callback path. The CDN
    serves the same neutral shell for every callback; early initialization restores the return URL
    in the browser before loading the app. No application callback route is needed.
-   The shared header, page outlet, inactivity overlay, and pages live under the pathless `_app`
    layout. `__root.tsx` contains only the document frame. This keeps `_shell.html` free of app UI,
    while prerendered public pages retain their layout and content. Public URLs are unchanged.
-   Make public pages safe to render at build time. Their prerendered HTML should not depend on
    browser APIs or values specific to a visitor's request. Wrap those parts in `ClientOnly` with
    a suitable fallback, while keeping the rest of the page prerendered. For example, the inactivity
    page's return link depends on the visitor's `return_url` search parameter, which is unknown
    during the build, so only that link is rendered on the client.
-   The development hostname and strict port are conditional on `isPreview`, since Start uses
    Vite preview while prerendering during the build.

## CDN routing: Vercel in this example

This example targets **Vercel**, with application-owned rules in [vercel.json](vercel.json).
It can be adapted to another CDN and backend host; the oidc-spa plugin does not generate CDN rules.

As with any Start SPA deployment, existing static pages and assets should be served first,
backend requests must reach the server, and other frontend URLs should fall back to `_shell.html`.
The catch-all rewrite excludes this application's `/api`, `/_serverFn`, and `/assets` paths.
**Update those exclusions if you change the server-function base, add server routes elsewhere,
or change Vite's assets directory.** These are example deployment choices, not oidc-spa conventions.
See [Start's SPA deployment guidance](https://tanstack.com/start/latest/docs/framework/react/guide/spa-mode#allowing-server-functions-and-server-routes).

Adding oidc-spa introduces one additional routing constraint: **GET and HEAD requests to
`/openid-callback/` must serve `/_shell.html` internally, preserving the browser URL and its
trailing slash.** The explicit callback rule runs before filesystem matching; the ordinary
frontend fallback runs after static files. Add the equivalent rule manually on another CDN.
API routes and server functions remain dynamic; frontend page requests do not need server rendering.

Vercel combines this project's `vercel.json` rules with Nitro's generated deployment routing.
Do not expect Nitro's `.vercel/output/config.json` alone to contain the project-level rewrites.
If deploying below a base path, include it in the registered callback URL and adapt all routing
sources and destinations to that base as well.

On Vercel, select `examples/tanstack-start-prerendered` as the project root. To inspect the output
locally, using the same build script as the reference example:

```sh
NITRO_PRESET=vercel npm run build
```

Inspect `.vercel/output/static/index.html`, `inactivity-logout/index.html`, and `_shell.html`.
`vite preview` previews Nitro's server; it does not apply Vercel's CDN rules. Use a Vercel preview
deployment to verify the platform routing. Authentication and API configuration follow the
[reference README](../tanstack-start/README.md); remember to use this example's callback URI.
