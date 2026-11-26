# Vercel deployment adapter

This directory is only needed when deploying to Vercel. `index.js` exposes the
generated React Router server build as a Vercel Node.js Function.

The rewrites in [`../vercel.json`](../vercel.json) forward `/api/*`, `.data`, and
route-discovery requests to this function. Vercel serves the frontend from
`build/client` as static files.

Existing static files, including prerendered pages, take precedence over the
rewrites. `/openid-callback/` and frontend URLs without a static file use
`__spa-fallback.html`, the empty shell generated when `/` is prerendered. The
fallback excludes `/api` and `/assets`, keeping backend requests on the function
and allowing missing assets to return 404.

The application API routes live in [`../app/routes/api`](../app/routes/api):
`todos.ts` and `trpc.$.ts`. This directory only adapts those routes and the
server loaders/actions to Vercel's request interface.

For local development, `yarn dev` uses React Router's development server. For
Node hosting, `yarn start` uses `react-router-serve`. Neither uses this directory.
If you deploy elsewhere, you can remove this directory and `vercel.json`, then
use the adapter or hosting configuration appropriate for that platform.
