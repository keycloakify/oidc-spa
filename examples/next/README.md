# Next.js Example (`oidc-spa`)

This example shows how to make `oidc-spa` work in a Next.js App Router application.

It is intentionally practical rather than generic: the point is to show the minimum wiring needed when using `oidc-spa` in Next, even though `oidc-spa` is not designed around Next.js primitives.

## Key Setup Insights

`oidc-spa` must be initialized early on the client. In this example, `instrumentation-client.ts` calls:

```ts
import { oidcEarlyInit } from "oidc-spa/entrypoint";

oidcEarlyInit({
    BASE_URL: "/"
});
```

The utils exposed by `oidc-spa` cannot be used directly in Next.js as-is. In particular, `OidcInitializationGate` and `withLoginEnforced` need manual Next-specific adapters. That adaptation lives in `lib/oidc.tsx`.

## Required Next.js Wiring

The whole app should be wrapped in `<OidcInitializationGate />`. In this example that happens in `app/layout.tsx`.

Pages or layouts that require an authenticated user should use the `withLoginEnforced` HOC. In this example that is how the protected sections are guarded.

Anything that touches `oidc-spa` must run on the client, which means those modules need `"use client";`.

## Important Limitation

Next.js cannot know at render time who the user is when authentication is handled through `oidc-spa` in the browser. In practice, this pushes the app toward SPA behavior and gives up most of the usual SSR auth-at-render-time advantages of Next.js.

## Routes

-   `/` public landing page with login/logout controls
-   `/protected` guarded page using the custom Next-compatible `withLoginEnforced`
-   `/admin-only` guarded page with a simple role check

## Quick Start

From the repository root:

```bash
yarn start-next-example
```

Or from `examples/next`:

```bash
yarn install
yarn dev
```

Copy `.env.local.sample` to `.env.local` if needed and set your provider values, or enable mock mode.
