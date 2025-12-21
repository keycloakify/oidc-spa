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

The Framework Agnostic Adapter:

```ts
import { createOidc } from "oidc-spa/core"; // 32 KB min+gzip (Import Cost overestimate by counting polyfills that are only loaded when needed.)
import { z } from "zod"; // 59 KB min+zip, but it's optional.

const oidc = await createOidc({
    issuerUri: "https://auth.my-domain.net/realms/myrealm",
    //issuerUri: "https://login.microsoftonline.com/...",
    //issuerUri: "https://xxx.us.auth0.com/..."
    //issuerUri: "https://accounts.google.com/o/oauth2/v2/auth"
    clientId: "myclient",
    // Optional, you can write a validator by hand, or give up some type-safety, your call.
    decodedIdTokenSchema: z.object({
        name: z.string(),
        picture: z.string().optional(),
        email: z.string(),
        realm_access: z.object({ roles: z.array(z.string()) })
    })
    // Yes really, it's that simple, there's no other params to provide.
    // The Redirect URI (callback url) is the root url of your app (no public/callback.html involved).
});

// In oidc-spa the user is either logged in or they aren't.
// The state will never mutate without a full app reload.
// This makes reasoning about auth much, much, easier.
if (!oidc.isUserLoggedIn) {
    await oidc.login();
    // Never here
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

Higher level adapters, example with React but we also feature similar Angular adapter:

<img width="1835" height="942" alt="Image" src="https://github.com/user-attachments/assets/a7a18bbc-998a-459c-8cfa-93b599a45524" />

Full Stack Auth solution with [TanStack Start](https://tanstack.com/start):

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

## What this is

oidc-spa is a framework-agnostic OpenID Connect client for browser-centric web applications implementing the [Authorization Code Flow with PKCE](https://docs.oidc-spa.dev/resources/why-no-client-secret).

It work with any spec compliant OIDC provider like [Keycloak](https://www.keycloak.org/), [Auth0](https://auth0.com/) or [Microsoft EntraID](https://www.microsoft.com/fr-fr/security/business/identity-access/microsoft-entra-id) and replace provider-specific SDKs like [keycloak-js](https://www.npmjs.com/package/keycloak-js), [auth0-spa-js](https://www.npmjs.com/package/@auth0/auth0-spa-js), or [@azure/msal-browser](https://www.npmjs.com/package/@azure/msal-browser) with one unified API, freeing your app from vendor lock-in and making it deployable in any IT system.  
Concretely this mean that it let you build an app and sell it to different companies ensuring they will be able to deploy it in their environment regardless of what auth platform they use internally. &#x20;

oidc-spa provides strong guarantees regarding token exfiltration prevention [**even in case of successful XSS or supply chain attacks**](https://docs.oidc-spa.dev/v/v8/resources/token-exfiltration-defence). No other implementation can currently claim that. &#x20;

It is uncompromising in terms of performance, security, DX, and UX. You get a state-of-the-art authentication and authorization system out of the box with zero glue code to write and no knobs to adjust.

Unlike server-centric solutions such as [Auth.js](https://authjs.dev/), oidc-spa makes the frontend the OIDC client in your IdP model's representation.

Your backend becomes a simple OAuth2 resource server that you frontend query with the access token attached as Authorization header. oidc-spa also provides the tools for token validation on the server side:

-   As an unified solution for [TanStack Start](https://tanstack.com/router/latest)&#x20;
-   Or, as [a separate adapter](integration-guides/tanstack-router-+-node-rest-api.md) for creating authed APIs with [tRCP](https://trpc.io/), [Express](https://expressjs.com/), [Hono](https://hono.dev/), [Nest.js](https://nestjs.com/), ect.

That means **no database,** no session store, and **enterprise-grade UX** out of the box, while scaling naturally to edge runtimes.

oidc-spa exposes real OIDC primitives, decoded ID tokens, access tokens, and claims, instead of hiding them behind a “user” object, helping you understand and control your security posture.

It’s infra-light, open-standard, transparent, and ready to work in minutes.

<details>

<summary>But in details? I want to understand the tradeoffs.</summary>  
<br />
  
In the modern tech ecosystem, no one “rolls their own auth” anymore, not even OpenAI or Vercel.\
Authentication has become a **platform concern**. Whether you host your own identity provider like **Keycloak**, or use a service such as **Auth0** or **Microsoft Entra ID**, authentication today means **redirecting users to your auth provider**.

---

**Why not** [**BetterAuth**](https://www.better-auth.com/) **or** [**Auth.js**](https://authjs.dev/)

These are great for what they are, but they’re “roll your own auth” solutions.\
With oidc-spa, you delegate authentication to a specialized identity provider such as Keycloak, Auth0, Okta, or Clerk.

With BetterAuth, your backend _is_ the authorization server, even if you can integrate third party identity providers id doesn't change that fact.\
That’s very battery-included, but also far heavier infrastructure-wise.\
Today, very few companies still roll their own auth, not even OpenAI or Vercel.

Another big difference: oidc-spa is **browser-centric**. The token exchange happens on the client,\
and the backend server is merely an OAuth2 resource server in the OIDC model.

If you use BetterAuth to provide login via Keycloak, your backend becomes the OIDC client application,\
which has some security benefits over browser token exchange, but at the cost of centralization and requiring backend infrastructure.

One clear advantage BetterAuth has over oidc-spa is more natural SSR support. In the oidc-spa model, the server doesn’t know the authentication state of the user at all time, which makes it difficult to integrate with traditional full-stack frameworks that rely on server-side rendering.

---

**Server Side Rendering**

The only SSR-capable framework we currently support is [TanStack Start](https://tanstack.com/start/latest), because it provides the low-level primitives needed to render as much as possible on the server while deferring rendering of auth aware components to the client.

This approach achieves a similar UX and performance to server-centric frameworks, but it’s inherently less transparent than streaming fully authenticated components to the client.

Try the TansStack Start example deployment with JavaScript disabled to get a feel of what can and can't be SSR'd: [https://example-tanstack-start.oidc-spa.dev/](https://example-tanstack-start.oidc-spa.dev/)

---

**Security and XSS resilience**

Yes; client-side authentication raises valid security concerns.\
But this isn’t a fatal flaw; it’s an **engineering challenge**, and oidc-spa addresses it head-on.

It treats the browser as a **hostile environment**, going to great lengths to protect tokens even under **XSS or supply-chain attacks**.\
These mitigations [are documented here](resources/why-no-client-secret.md).

---

**Limitations regarding backend delegation**

The main limitation is with **long-running background operations**.\
If your backend must call third-party APIs **on behalf of the user** while they’re offline, you’ll need **service accounts** for those APIs or take charge of rotating tokens yourself which [can be tricky](https://authjs.dev/guides/refresh-token-rotation).\
Beyond that, everything else scalability, DX, performance, works in your favor.

---

If that all sounds good to you…\
**Let’s get started.**

</details>

## Integration

-   Full Stack - all in one auth solution:
    -   [TanStack Start](https://docs.oidc-spa.dev/integration-guides/tanstack-start)
-   Single Page Apps (SPAs):
    -   [Framework Agnostic](https://docs.oidc-spa.dev/integration-guides/usage)
    -   [React Router](https://docs.oidc-spa.dev/integration-guides/react-router)
    -   [Tanstack Router](https://docs.oidc-spa.dev/integration-guides/tanstack-router-start/react-router)
    -   [Angular](https://docs.oidc-spa.dev/integration-guides/angular)
    -   ...More to come...
-   Backend: [Express, Hono, tRPC, Nest.js ...](https://docs.oidc-spa.dev/integration-guides/tanstack-router-+-node-rest-api)

## Comparison with Existing Libraries

With other OIDC clients, you'll get something that works in the happy path.  
But then you will face issues like:

-   The user cannot navigate back from the login page to your app.
-   User get hit with "your session has expired please login again" after spending an hours filling your form.
-   User logged out or logged in on one tabe but the state is not propagated to the other tabs.
-   Random 401 from your API with "token expired"
-   You can't run E2E test without having to actually connect to a real server.

Plus you'll realize that your configuration works with one provider in one devloppement configuration,
try to switch IdP and the all thing fall appart, you'll be met with criptic errors and have to spend
days tweeking knobs again.

With oidc-spa, there's no knobs to adjust, things just work out of the box.  
And you get XSS and suply chain attack protection, unlike with any other client side solution.

### [oidc-client-ts](https://github.com/authts/oidc-client-ts)

It is a great low-level implementation of the OIDC primitives.  
But it is only that, a low-level implementation. If you want to use it in your application,
you’ll have to write a ton of glue code to achieve a state-of-the-art UX,  
code that has no business living in application-level logic.

Example of what you get out of the box with oidc-spa:

-   **Login/logout propagation** across tabs
-   **SSO that just works**, regardless of the deployment configuration.
-   **Seamless browser back/forward cache (bfcache) management**
-   **Auto logout**: avoid "your session has expired please login again" after the used just spend an hour filling your form.
-   **Never getting an expired access token error**, even after waking from sleep
-   **Graceful handling when the provider lacks refresh tokens or a logout endpoint** (e.g. Google OAuth)
-   **Mock support**, run with a mock identity without contacting a server
-   **Helpfull debug logs** important if you sell your solution, to streamline deployment.

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

oidc-spa exports `oidc-spa/keycloak` providing all the keycloak specific feature that keycloak-js offers.

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

With BetterAuth, your backend _is_ the authorization server. (even if you can integrate third party provider).  
That’s very battery-included, but also far heavier infrastructure-wise.  
Today, very few companies still roll their own auth—including OpenAI and Vercel.

Another big difference: oidc-spa is **browser-centric**. The token exchange happens on the client,  
and the backend server is merely an OAuth2 resource server in the OIDC model.

If you use BetterAuth to provide login via Keycloak, your backend becomes the OIDC client application,  
which has some security benefits over browser token exchange, but at the cost of centralization and requiring backend infrastructure.

And with the [advanced exfiltration model enabled](https://docs.oidc-spa.dev/resources/token-exfiltration-defence), the security guarantees of a frontend-based approach become _theoretically equivalent_ to backend-based token exchange.

I say “theoretically” not because users might misconfigure oidc-spa, the library refuses to start unless all requirements are met, but because this equivalence ultimately depends on the correctness of oidc-spa’s own hardening implementation. Backend flows avoid this concern entirely since tokens never enter the execution environment in the first place.

One clear advantage BetterAuth has over oidc-spa is better SSR (Server-Side Rendering) support.
In the oidc-spa model, authentication is handled entirely on the client, which makes it challenging to integrate with traditional full-stack frameworks that depend on server-side rendering.

Currently, the only SSR-capable framework we support is TanStack Start, which provides the low-level primitives required to render as much as possible on the server while deferring user-specific components to the client.
We won’t pretend this is a small limitation, it significantly restricts what can actually be SSR’d. In practice, you can only server render content that’s identical for every user (such as the marketing pages and layout), while everything user-dependent must be rendered client-side.

This doesn’t hurt UX or performance, but it’s inherently less flexible than streaming fully authenticated server components to the client.
That said, with TanStack Start, the abstractions are elegant enough that this separation is mostly transparent, it just works.

When it comes to Next.js or React Router frameworks with server features, however, we currently can’t offer a convincing solution.

The strength of oidc-spa lies elsewhere: it’s extremely lightweight, requiring no backend, no extra infrastructure, and scaling effortlessly at the edge. It’s fast, secure, and keeps your deployments simple. The trade-off is that SSR becomes more difficult, though, as shown in [the TanStack Start example](https://example-tanstack-start.oidc-spa.dev/), not impossible.

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
