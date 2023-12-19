# Oidc-spa React Router Example

This example project demonstrates how to use the oidc-spa library with React Router for building a Single Page Application (SPA) with OpenID Connect (OIDC) authentication.

Since RouterProvider decouples fetching from rendering, we can no longer rely on React context and/or hooks to get our user authentication status. We need access to this information outside of the React tree so we can use it in our route loader and action functions. We use [`prOidc`](src/oidc.tsx#L5)