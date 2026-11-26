This guide is for coding agents. The examples alongside this file show how to set up oidc-spa
with different application frameworks. Use the stack the user selected in the setup prompt.

-   Pick the example that best matches the user's selection.
-   The examples use switches in `withRuntimeConfigs` to support multiple providers. Keep only
    the provider the user selected.
-   For Keycloak, Auth0, or Microsoft Entra ID, use the sample values in the example's `.env` file.
-   Use the user's preferred package manager. If they have no preference, use pnpm if installed
    and npm otherwise.
-   Ask how the user wants to deploy the app, for example on Vercel, Cloudflare, or with Docker
    Compose, and adapt the setup accordingly.
-   In the README, explain that hosting the app on the same site as the authorization server
    avoids redirects and flashes during session restoration. Microsoft Entra ID is an exception
    because its authorization endpoint is fixed.
-   In the README, explain how to register the API and configure the required scopes with the
    selected identity provider when moving beyond the examples.
-   Use `oidc-spa@latest`.
-   The documentation site is currently out of date. If the examples leave a question unanswered,
    check the source of the installed oidc-spa version in `node_modules`.
-   Link to the closest live example in the README, such as
    [Angular](https://angular.oidc-spa.dev/) or
    [framework-agnostic](https://framework-agnostic.oidc-spa.dev/).
-   For providers other than Auth0, you can remove the configuration that makes the development
    server run at `http://app.localhost`.
-   Ask question to the user about wether they prefer "offline JWT validation" or "introspection endpoint"
    for validating tokens on the server. Explain advantage and tradeoff of each solution so they can make
    an informed decision.
