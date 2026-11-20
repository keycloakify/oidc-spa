Vercel automatically turns supported source files in the project's `api/` directory
into functions. Keep only function entry points here; the shared backend code lives
in `../server/`.

`index-vercel.ts` forwards incoming requests to the shared Express app. Vercel
manages the HTTP server, so this entry does not call `app.listen()`.

The deployment is configured in [`../vercel.json`](../vercel.json): it sets the
build command and static output directory, routes `/api/*` requests to this
function, and defines the SPA fallback and cache headers.

Angular emits hashed JS/CSS bundles at the client root. Its cache rules cover those
files as well as `/assets/`; HTML and unversioned public files require revalidation.
The frontend fetches public OIDC settings from `/api/oidc-client-env` at runtime.

The function explicitly loads the committed `../.env` as demo defaults. Vercel
does not load it automatically at runtime, so `vercel.json` includes it in the
function package. Variables configured in Vercel take precedence over the file.

Vercel compiles this function separately from our standalone server bundle. The
compiled code runs as native Node.js ESM, which requires explicit extensions in
relative imports and explicit filenames for directory imports. That is why the
server source uses paths such as `./app.js` and `./data/todos/index.js`. TypeScript
resolves these to the corresponding `.ts` files during compilation; Node loads the
emitted `.js` files at runtime.
