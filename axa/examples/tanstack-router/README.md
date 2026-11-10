# AXA OIDC + TanStack Router

A Keycloak-only port of [`examples/tanstack-router`](../../../examples/tanstack-router).
The frontend uses the published **`@axa-fr/react-oidc@7.29.8`** package. The Express
and tRPC backend keeps **`oidc-spa@11.0.0-rc.8`**, imported only as `oidc-spa/server`.
The local AXA source checkout is a reference; this app does not modify or link it.

## Run

Use Node.js 22.22+ and npm:

```sh
cd axa/examples/tanstack-router
npm ci
npm run dev
```

Open **http://axa.localhost:3002**. Vite proxies `/api` to Express on port **3003**.
These ports and the separate origin let the original example run alongside this
one on `app.localhost:3000` without sharing service workers or local todo files.
Run commands from this directory; the Node server loads its `.env` here.

```sh
npm test
npm run typecheck
npm run build
npm start
```

The production server serves both the SPA and APIs on port 3002 (`PORT` overrides
it). `API_PORT` overrides the development API port; also update the Vite proxy.

## Keycloak client configuration

Use the existing public client **`myapp`** in:

```text
https://phasetwo.oidc-spa.dev/realms/demo-realm
```

Enable the standard Authorization Code flow with PKCE S256 and configure:

| Setting                         | Value                                                             |
| ------------------------------- | ----------------------------------------------------------------- |
| Valid redirect URIs             | `http://axa.localhost:3002/authentication/callback`               |
|                                 | `http://axa.localhost:3002/authentication/silent-callback`        |
|                                 | `http://axa.localhost:3002/account` (account console return link) |
| Valid post logout redirect URIs | `http://axa.localhost:3002/`                                      |
| Web origins                     | `http://axa.localhost:3002`                                       |

Keep any existing entries needed by the original example. These AXA URLs replace
our initial proposed `app.localhost:3000` URLs for this port. The silent-login
**start** page `/authentication/silent-login` is served by AXA's provider and is
not an OIDC callback to register.

The access token must include audience **`myapp-api`**. Configure the audience
mapper/client scope on Keycloak; adding an `audience` parameter to the frontend is
not a replacement. Both frontend and backend use `.env`, and the backend checks
issuer, signature, expiration, audience, and DPoP binding when present. No client
secret is needed. Vite embeds `VITE_*` values when building; restart/rebuild after
changes. If the issuer changes, update `public/OidcTrustedDomains.js` too.

For the admin demo, issue a top-level `roles` array containing `admin` in the
access token, as in the source example. The server independently enforces this
role. Other users can use their own todo lists but receive 403 from admin methods.

## Frontend integration

-   `src/main.tsx`: AXA's `OidcProvider` restores the existing session and owns all
    callback/silent-login pages before mounting TanStack's `RouterProvider`.
    `withCustomHistory` updates TanStack history and AXA's `popstate` listener.
    Session loss and failed authentication have recovery links.
-   `src/oidc.ts`: Keycloak configuration, imperative `OidcClient` access for route
    loaders, and AXA's `fetchWithTokens` wrapper. Renewal uses AXA's built-in timer,
    with a 5-second lead because this demo realm issues short-lived tokens.
-   `src/routes/_authenticated/route.tsx`: one `beforeLoad` guard for every protected
    page. Child loaders wait for authentication. Link preloading is disabled because
    AXA's imperative login starts navigation immediately.
-   `src/user.ts`: maps AXA's decoded ID/access-token payload hooks to the display
    model (name, email, avatar, admin navigation). The raw tokens remain hidden.
-   `src/trpc.ts`: passes AXA's authenticated fetch to `httpBatchLink`. REST loaders
    use the same wrapper. No React hook is needed in imperative route loaders.

### Service worker

`postinstall` uses AXA's official copy command to place the installed worker in
`public/OidcServiceWorker.js`. The generated worker is ignored by Git. The checked-in
`public/OidcTrustedDomains.js` allows only this Keycloak realm and same-origin
`/api` requests. AXA's worker holds access/refresh tokens and substitutes token
placeholders on trusted requests. The runnable example uses bearer tokens (see
the DPoP limitation below). Multi-tab login is enabled; always use AXA's fetch
wrapper so the worker can select the tab's session. Browser-storage fallback is disabled (`service_worker_only: true`).

Use a secure context (HTTPS or localhost). For deployment, serve both worker files
as JavaScript at the origin root and retain the SPA fallback for callback/deep-link
URLs. The included Vercel configuration builds the same app; configure the `.env`
values in Vercel and register the deployed origin's corresponding URLs. Use
`KV_REST_API_URL` and `KV_REST_API_TOKEN` for persistent todos on Vercel. Otherwise
local development/Node production use JSON files in the working directory.

### Verified DPoP limitation in AXA 7.29.8

Live testing against the supplied realm successfully completed login and callback
navigation with worker DPoP enabled. However, the first tRPC request failed:

```text
htu: http://axa.localhost:3002/api/trpc/todos.list?batch=1&input=%7B%7D
expected htu: http://axa.localhost:3002/api/trpc/todos.list
```

AXA's worker signs the complete request URL, including its query. RFC 9449 section
4.2 requires the `htu` claim to exclude query and fragment components. The unchanged
`oidc-spa/server` validator rejects that proof. This is a limitation observed in
this version and flow, not a claim that AXA lacks DPoP support.

**DPoP is therefore disabled in this port's trusted-domain configuration**, and
REST/tRPC use bearer tokens with AXA's worker isolation. To reproduce the failure,
set `demonstratingProofOfPossession: true` and
`demonstratingProofOfPossessionOnlyWhenDpopHeaderPresent: false` in
`public/OidcTrustedDomains.js`, then start a fresh login in a fresh tab. Existing
tokens remain bound to their original key until a new authorization-code exchange.
No AXA library code or server validation has been patched to accommodate this.
The original example's DPoP configuration is consequently not equivalent to this
port's working bearer configuration; make that explicit in comparisons.

Sources: [RFC 9449 section 4.2](https://www.rfc-editor.org/rfc/rfc9449.html#section-4.2),
[AXA worker request signing](../../oidc-client/packages/oidc-client-service-worker/src/OidcServiceWorker.ts),
and [AXA proof generation](../../oidc-client/packages/oidc-client-service-worker/src/jwt.ts).

### Session behavior and Keycloak account actions

**Inactivity auto-logout and its countdown overlay are deliberately omitted.**
In the reviewed AXA 7.29.8 configuration and session/renewal code, no built-in
user-activity timer or warning countdown was found. `monitor_session: true`
monitors the identity-provider session when supported by Keycloak and the browser;
it does not implement the source example's logout after user inactivity.
Automatic renewal can keep the server session alive while the user is idle.
This port adds no application inactivity timer. Session loss and cross-tab logout
use AXA's existing provider behavior.

Registration uses `login(returnTo, { prompt: "create" })`, supported by current
Keycloak. Realm registration must be enabled. Password/profile/deletion requests
use AXA's `login("/account", { kc_action: ... })`; the realm must enable the
corresponding required actions and account permissions. The account-console URL
is built in application code. AXA's callback result does not expose
`kc_action_status`, so this port does not reproduce the original action-result
message. Cancelled actions that return an OIDC error use the authentication-error
screen. Account deletion/password changes should be exercised only on a disposable
test account.

Silent iframe login/session checks depend on the provider and browser's
third-party-cookie policy. A locally restored worker session and a new tab's
Keycloak SSO session are different cases; test both for the presentation.

## Validation

`npm test` starts an isolated local discovery/JWKS server, signs fixture tokens,
and exercises the real Express/tRPC handlers and installed `oidc-spa/server`.
It checks unauthenticated rejection, shared REST/tRPC storage, per-user isolation,
issuer/audience/expiry/signature rejection, admin enforcement, valid DPoP, proof
replay rejection, and bound-token rejection without a proof. Temporary todo files
are removed after the tests. A worker-allowlist test checks path/host boundaries.
These tests do not log into Keycloak or change its configuration.

Completed in this checkout:

-   All 9 automated tests, TypeScript checking, and production build pass.
-   Production smoke checks pass for the home page, protected deep links, both
    callback pages, JavaScript worker assets, and unauthenticated API rejection.
-   Real Keycloak PKCE login and callback navigation completed successfully.
-   Worker DPoP failed on the tRPC URL query as documented above.
-   Live bearer-mode API and renewal checks are pending the final browser pass.

## References

-   [AXA React integration](https://github.com/AxaFrance/oidc-client/blob/main/packages/react-oidc/README.md)
-   [AXA core configuration and worker options](https://github.com/AxaFrance/oidc-client/blob/main/packages/oidc-client/README.md)
-   [AXA service worker](https://github.com/AxaFrance/oidc-client/blob/main/packages/oidc-client-service-worker/README.md)
-   [Keycloak authorization endpoint (`prompt=create`)](https://github.com/keycloak/keycloak/blob/main/services/src/main/java/org/keycloak/protocol/oidc/endpoints/AuthorizationEndpoint.java)
