![oidc-spa](https://github.com/keycloakify/oidc-spa/assets/6702424/3375294c-cc31-4fc1-9fb5-1fcfa00423ba)

<p align="center">
    <br>
    <a href="https://github.com/keycloakify/oidc-spa/actions">
      <img src="https://github.com/keycloakify/oidc-spa/actions/workflows/ci.yaml/badge.svg?branch=main">
    </a>
    <a href="https://www.npmjs.com/package/oidc-spa">
      <img src="https://img.shields.io/npm/dw/oidc-spa">
    </a>
    <a href="https://github.com/garronej/oidc-spa/blob/main/LICENSE">
      <img src="https://img.shields.io/npm/l/oidc-spa">
    </a>
</p>
<p align="center">
  We're here to help!<br/>
  <a href="https://discord.gg/mJdYJSdcm4">
    <img src="https://dcbadge.limes.pink/api/server/kYFZG7fQmn"/>
  </a>
</p>
<p align="center">
  <a href="https://www.oidc-spa.dev">Home</a>
  -
  <a href="https://docs.oidc-spa.dev">Documentation</a>
</p>

## At a glance

The Framework-Agnostic Adapter:

```ts
import { createOidc, oidcEarlyInit } from "oidc-spa/core"; // 32 KB min+gzip (Import Cost overestimate by counting polyfills that are only loaded when needed.)
import { z } from "zod"; // 59 KB min+gzip, but it's optional.

// Call this only if you don't use oidc-spa's Vite plugin.
oidcEarlyInit({ BASE_URL: "/" });

const oidc = await createOidc({
    issuerUri: "https://auth.my-domain.net/realms/myrealm",
    //issuerUri: "https://login.microsoftonline.com/...",
    //issuerUri: "https://xxx.us.auth0.com/..."
    //issuerUri: "https://accounts.google.com/o/oauth2/v2/auth"
    clientId: "myclient",
    // Optional; you can write a validator by hand, or give up some type-safety, your call.
    decodedIdTokenSchema: z.object({
        name: z.string(),
        picture: z.string().optional(),
        email: z.string(),
        realm_access: z.object({ roles: z.array(z.string()) })
    })
    // Yes, really, it's that simple; there are no other parameters to provide.
    // The Redirect URI (callback URL) is the root URL of your app (no public/callback.html involved).
});

// In oidc-spa the user is either logged in or they aren't.
// The state will never mutate without a full app reload.
// This makes reasoning about auth much, much easier.
if (!oidc.isUserLoggedIn) {
    await oidc.login();
    // Never here
    return;
}

const { name, realm_access } = oidc.getDecodedIdToken();

console.log(`Hello ${name}`);

const { accessToken } = await oidc.getTokens();

await fetch("https://my-domain.net/api/todos", {
    headers: {
        Authorization: `Bearer ${accessToken}`
    }
});

if (realm_access.roles.includes("realm-admin")) {
    // User is an admin
}
```

Higher-level adapters, example with React but we also feature a similar Angular adapter:

<img width="1835" height="942" alt="Image" src="https://github.com/user-attachments/assets/a7a18bbc-998a-459c-8cfa-93b599a45524" />

Full-stack auth solution with [TanStack Start](https://tanstack.com/start):

```tsx
import { createServerFn } from "@tanstack/react-start";
import { enforceLogin, oidcFnMiddleware } from "@/oidc";
import fs from "node:fs/promises";

const getTodos = createServerFn({ method: "GET" })
    .middleware([oidcFnMiddleware({ assert: "user logged in" })])
    .handler(async ({ context: { oidc } }) => {
        const userId = oidc.accessTokenClaims.sub;

        const json = await fs.readFile(`todos_${userId}.json`, "utf8");

        return JSON.parse(json);
    });

export const Route = createFileRoute("/todos")({
    beforeLoad: enforceLogin,
    loader: () => getTodos(),
    component: RouteComponent
});

function RouteComponent() {
    const todos = Route.useLoaderData();

    return (
        <ul>
            {todos.map(todo => (
                <li key={todo.id}>
                    {todo.isDone && "✅"} {todo.text}
                </li>
            ))}
        </ul>
    );
}
```

[Try the Examples](https://docs.oidc-spa.dev/integration-guides)

## What this is

oidc-spa is an OpenID Connect client for browser-centric web apps.  
It implements the [Authorization Code Flow with PKCE](https://docs.oidc-spa.dev/resources/why-no-client-secret) + [DPoP](https://docs.oidc-spa.dev/security-features/dpop) and
also provides [token validation utilities for JavaScript backends](https://docs.oidc-spa.dev/integration-guides/backend-token-validation).

It’s a single library that can replace platform-specific SDKs like keycloak-js, MSAL.js, @auth0/auth0-spa-js, etc. on the frontend,
and [jsonwebtoken](https://www.npmjs.com/package/jsonwebtoken), [jose](https://www.npmjs.com/package/jose) or [express-jwt](https://www.npmjs.com/package/express-jwt) on your backend.

oidc-spa provides a level of protection in case of a successful supply-chain or XSS attack that goes
far beyond the current best practices for client-side auth, and what other solutions provide. [Learn more](https://docs.oidc-spa.dev/v/v9/security-features/overview).

**Is it a good fit for my stack?**

oidc-spa shines in apps where logic and state live primarily in the browser. Think single-page applications (SPAs) and frontend-oriented frameworks like TanStack Start.

It’s not a good fit for Next.js, Nuxt, or Astro. These meta-frameworks try to involve the client as little as possible. In oidc-spa, auth is driven by the browser, so there’s a philosophy mismatch.

## Comparison with Existing Libraries

With other OIDC clients, you'll get something that works in the happy path.  
But then you will face issues like:

-   The user cannot navigate back from the login page to your app.
-   Users get hit with "your session has expired, please log in again" after spending an hour filling out your form.
-   Users log out or log in on one tab but the state is not propagated to the other tabs.
-   Random 401 from your API with "token expired"
-   You can't run E2E tests without having to actually connect to a real server.

Plus you'll realize that your configuration works with one provider in one development configuration.
Try to switch IdPs and the whole thing falls apart; you'll be met with cryptic errors and have to spend
days tweaking knobs again.

With oidc-spa, there's no knobs to adjust; things just work out of the box.  
And you get XSS and supply-chain attack protection, unlike with any other client-side solution.

### [oidc-client-ts](https://github.com/authts/oidc-client-ts)

It is a great low-level implementation of the OIDC primitives.  
But it is only that, a low-level implementation. If you want to use it in your application,
you’ll have to write a ton of glue code to achieve a state-of-the-art UX,  
code that has no business living in application-level logic.

Example of what you get out of the box with oidc-spa:

-   **Login/logout propagation** across tabs
-   **SSO that just works**, regardless of the deployment configuration.
-   **Seamless browser back/forward cache (bfcache) management**
-   **Auto logout**: avoid "your session has expired, please log in again" after the user just spent an hour filling out your form.
-   **Never getting an expired access token error**, even after waking from sleep
-   **Graceful handling when the provider lacks refresh tokens or a logout endpoint** (e.g. Google OAuth)
-   **Mock support**, run with a mock identity without contacting a server
-   **Helpful debug logs** to streamline deployment, especially if you sell your solution.

oidc-spa just works. You provide the few parameters required to talk to your IdP, and that’s it.

On top of that, oidc-spa provides much stronger security guarantees than `oidc-client-ts` does out of the box,  
and yields a level of performance that isn’t realistically achievable with the tools `oidc-client-ts` alone provides.

### [react-oidc-context](https://github.com/authts/react-oidc-context)

react-oidc-context is a thin React wrapper around oidc-client-ts.  
`oidc-client-ts` compares to `oidc-spa/core`,  
and `react-oidc-context` compares to `oidc-spa/react-spa`.

oidc-spa provides much better security, DX, and UX out of the box.

### [keycloak-js](https://www.npmjs.com/package/keycloak-js)

> NOTE: You can use `oidc-spa/keycloak-js` as [a **literal** drop-in replacement for `keycloak-js`](https://docs.oidc-spa.dev/resources/migrating-from-keycloak-js)  
> your app will instantly perform better, be much more secure, and implement session expiration correctly.

The official OIDC client for Keycloak has several issues:

-   Does not respect the OIDC spec, hence only works with Keycloak, requiring a wildcard in valid redirect URIs, which [is problematic](https://securityblog.omegapoint.se/en/writeup-keycloak-cve-2023-6927/).
-   Its API encourages incorrect usage, e.g., by [directly exposing the access token via a synchronous API.](https://docs.oidc-spa.dev/features/tokens-renewal).
-   Does not expose high-level adapters for React or Angular, requiring you to write your own wrappers.
-   Does not handle redirects correctly: once on the login page, you can’t go back.
-   Makes no attempt to protect tokens against XSS attacks.
-   You can't [talk to more than one resource server](https://docs.oidc-spa.dev/features/talking-to-multiple-apis-with-different-access-tokens).
-   Does not handle session expiration; users aren’t automatically logged out or warned before expiration.
-   Lacks mock implementations for testing against mock identities.

oidc-spa exports `oidc-spa/keycloak`, providing all the Keycloak-specific features that keycloak-js offers.

oidc-spa even comes with a polyfill implementation of the keycloak-js API.

### [keycloak-angular](https://github.com/mauriciovigolo/keycloak-angular)

It’s an Angular wrapper for keycloak-js, with the same limitations as above.  
oidc-spa exposes an Angular adapter: [oidc-spa/angular](https://docs.oidc-spa.dev/integration-guides/angular).

### [angular-oauth2-oidc](https://github.com/manfredsteyer/angular-oauth2-oidc)

This is a solid generic OIDC adapter.  
However, `oidc-spa/angular` still has several advantages:

-   [Better security guarantees](https://docs.oidc-spa.dev/resources/token-exfiltration-defence) (angular-oauth2-oidc does not protect tokens from XSS or supply-chain attacks)
-   DX more aligned with modern Angular.
-   Auto logout overlay (“Are you still there?” countdown)
-   Stronger type safety with propagated user profile types
-   Ability to start rendering before session restoration settles
-   Support for multiple resource servers
-   Clearer and more actionable error messages for misconfiguration

### [BetterAuth](https://www.better-auth.com/) / [Auth.js](https://authjs.dev/)

These are great for what they are, but they’re “roll your own auth” solutions.  
With oidc-spa, you delegate authentication to a specialized identity provider such as Keycloak, Auth0, Okta, or Clerk.

With BetterAuth, your backend _is_ the authorization server (even if you can integrate a third-party provider).  
That’s very batteries-included, but also far heavier infrastructure-wise.  
Today, very few companies still roll their own auth—including OpenAI and Vercel.

Another big difference: oidc-spa is **browser-centric**. The token exchange happens on the client,  
and the backend server is merely an OAuth2 resource server in the OIDC model.

If you use BetterAuth to provide login via Keycloak, your backend becomes the OIDC client application,  
which has some security benefits over browser token exchange, but at the cost of centralization and requiring backend infrastructure.

And with the [advanced exfiltration model enabled](https://docs.oidc-spa.dev/resources/token-exfiltration-defence), the security guarantees of a frontend-based approach become _theoretically equivalent_ to backend-based token exchange.

I say “theoretically” not because users might misconfigure oidc-spa (the library refuses to start unless all requirements are met), but because this equivalence ultimately depends on the correctness of oidc-spa’s own hardening implementation. Backend flows avoid this concern entirely since tokens never enter the execution environment in the first place.

One clear advantage BetterAuth has over oidc-spa is better SSR (Server-Side Rendering) support.
In the oidc-spa model, authentication is handled entirely on the client, which makes it challenging to integrate with traditional full-stack frameworks that depend on server-side rendering.

Currently, the only SSR-capable framework we support is TanStack Start, which provides the low-level primitives required to render as much as possible on the server while deferring user-specific components to the client.
We won’t pretend this is a small limitation; it significantly restricts what can actually be SSR’d. In practice, you can only server-render content that’s identical for every user (such as the marketing pages and layout), while everything user-dependent must be rendered client-side.

This doesn’t hurt UX or performance, but it’s inherently less flexible than streaming fully authenticated server components to the client.
That said, with TanStack Start, the abstractions are elegant enough that this separation is mostly transparent; it just works.

When it comes to Next.js or React Router frameworks with server features, however, we currently can’t offer a convincing solution.

The strength of oidc-spa lies elsewhere: it’s extremely lightweight, requiring no backend, no extra infrastructure, and scaling effortlessly at the edge. It’s fast, secure, and keeps your deployments simple. The trade-off is that SSR becomes more difficult, though, as shown in [the TanStack Start example](https://example-tanstack-start.oidc-spa.dev/), but not impossible.

## Acknowledgment

oidc-spa vendors [oidc-client-ts](https://github.com/authts/oidc-client-ts) for its frontend logic and [jose](https://github.com/panva/jose) for token validation on the backend.  
The idea was to build on top of battle-tested primitives.  
We appreciate what we owe to those projects.

## 🚀 Quick start

Head over to the [documentation website](https://docs.oidc-spa.dev) 📘!

## Sponsors

Project backers — we trust and recommend their services.

<br/>

<div align="center">

![Logo Dark](https://github.com/user-attachments/assets/d8f6b6f5-3de4-4adc-ba15-cb4074e8309b#gh-dark-mode-only)

</div>

<div align="center">

![Logo Light](https://github.com/user-attachments/assets/20736d6f-f22d-4a9d-9dfe-93be209a8191#gh-light-mode-only)

</div>

<br/>

<p align="center">
    <i><a href="https://phasetwo.io/?utm_source=keycloakify"><strong>Keycloak as a Service</strong></a> — Keycloak community contributors of popular <a href="https://github.com/p2-inc#our-extensions-?utm_source=keycloakify">extensions</a> providing free and dedicated <a href="https://phasetwo.io/hosting/?utm_source=keycloakify">Keycloak hosting</a> and enterprise <a href="https://phasetwo.io/support/?utm_source=keycloakify">Keycloak support</a> to businesses of all sizes.</i>
</p>

<br/>
<br/>
<br/>

<div align="center">

![Logo Dark](https://github.com/user-attachments/assets/dd3925fb-a58a-4e91-b360-69c2fa1f1087#gh-dark-mode-only)

</div>

<div align="center">

![Logo Light](https://github.com/user-attachments/assets/6c00c201-eed7-485a-a887-70891559d69b#gh-light-mode-only)

</div>

<br/>

<p align="center">
  <a href="https://www.zone2.tech/services/keycloak-consulting">
    <i><strong>Keycloak Consulting Services</strong> — Your partner in Keycloak deployment, configuration, and extension development for optimized identity management solutions.</i>
  </a>
</p>
