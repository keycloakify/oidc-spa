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

## What this is

oidc-spa is an OpenID Connect client for browser-centric web applications implementing the [Authorization Code Flow with PKCE](resources/why-no-client-secret.md).

oidc-spa replaces provider-specific SDKs like [keycloak-js](https://www.npmjs.com/package/keycloak-js), [auth0-spa-js](https://www.npmjs.com/package/@auth0/auth0-spa-js), or [@azure/msal-browser](https://www.npmjs.com/package/@azure/msal-browser) with one unified API that works with Keycloak, Auth0, Entra ID, and any other spec-compliant OIDC provider.

oidc-spa provides strong guarantees regarding the [protection of your tokens **even in case of successful XSS or supply chain attacks**](resources/why-no-client-secret.md#how-oidc-spa-mitigates-the-risks-of-token-exposure). No other solution does that.

oidc-spa is uncompromising in terms of performance, security, DX, and UX. You get a state-of-the-art authentication and authorization system out of the box with zero glue code to write and no knobs to adjust.

Unlike server-centric solutions such as [NextAuth](https://next-auth.js.org/), oidc-spa makes the frontend the OIDC client.

Your backend becomes a simple OAuth2 resource server, and tokens can be validated offline. oidc-spa [also provides the tools for token validation on the server side](integration-guides/tanstack-router-+-node-rest-api.md).

That means no database, no session store, and **enterprise-grade UX** out of the box, while scaling naturally to edge runtimes.

oidc-spa exposes real OIDC primitives, ID tokens, access tokens, and claims—instead of hiding them behind a “user” object, helping you understand and control your security posture.

It’s infra-light, open-standard, transparent, and ready to work in minutes.

## Integration

It's at its core [a framework-agnostic solution](https://docs.oidc-spa.dev/integration-guides/usage). But, in an effort to minimize the amount of glue code you have to write, it also exposes specific adapters for popular environments alongside implementation examples:

-   Full Stack: [TanStack Start](https://docs.oidc-spa.dev/integration-guides/tanstack-start)
-   React SPAs: With [React Router](https://docs.oidc-spa.dev/integration-guides/react-router) and TanStack Router integration.
-   [Angular](https://docs.oidc-spa.dev/integration-guides/angular)
-   ...more are coming

## Comparison with Existing Libraries

### [oidc-client-ts](https://github.com/authts/oidc-client-ts)

It is a great low-level implementation of the OIDC primitives.  
But it is only that, a low-level implementation. If you want to use it in your application,
you’ll have to write a ton of glue code to achieve a state-of-the-art UX,  
code that has no business living in application-level logic.

Example of what you get out of the box with oidc-spa:

-   **Login/logout propagation** across tabs
-   **Automatic silent sign-in when possible**, with full-page redirect fallback
-   **Seamless browser back/forward cache (bfcache) management**
-   **Auto logout countdown** so users are warned before inactivity logout
-   **Never getting an expired access token error**, even after waking from sleep
-   **Graceful handling when the provider lacks refresh tokens or a logout endpoint** (e.g. Google OAuth)
-   **Mock support**, run with a mock identity without contacting a server

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

-   [Better security guarantees](https://docs.oidc-spa.dev/resources/why-no-client-secret#how-oidc-spa-mitigates-the-risks-of-token-exposure) (angular-oauth2-oidc does not protect tokens from XSS or supply-chain attacks)
-   Better performance due to early initialization
-   Auto logout overlay (“Are you still there?” countdown)
-   Stronger type safety with propagated user profile types
-   Ability to start rendering before session restoration settles
-   Support for multiple resource servers
-   Clearer and more actionable error messages for misconfiguration

### [BetterAuth](https://www.better-auth.com/) / [NextAuth.js](https://next-auth.js.org/)

These are great for what they are—but they’re “roll your own auth” solutions.  
With oidc-spa, you delegate authentication to a specialized identity provider such as Keycloak, Auth0, Okta, or Clerk.

With BetterAuth, your backend _is_ the authorization server.  
That’s very battery-included, but also far heavier infrastructure-wise.  
Today, very few companies still roll their own auth—including OpenAI and Vercel.

Another big difference: oidc-spa is **browser-centric**. The token exchange happens on the client,  
and the backend server is merely an OAuth2 resource server in the OIDC model.

If you use BetterAuth to provide login via Keycloak, your backend becomes the OIDC client application—  
which has some security benefits over browser token exchange, but at the cost of centralization and requiring backend infrastructure.

One clear advantage BetterAuth has over oidc-spa is SSR support.
In the oidc-spa model, the server doesn’t handle authentication directly, which makes it difficult to integrate with traditional full-stack frameworks that rely on server-side rendering.

The only SSR-capable framework we currently support is TanStack Start, because it provides the low-level primitives needed to render as much as possible on the server while deferring authentication logic to the client.

This approach achieves a similar UX and performance to server-centric frameworks, but it’s inherently less flexible than streaming fully authenticated server components to the client.

oidc-spa is extremely lightweight, it’s just a library, with no infrastructure or backend requirements. It scales beautifully, delivers great performance at the edge, and keeps your deployment simple. The tradeoff is that SSR becomes harder, though not impossible, as [demonstrated with TanStack Start](https://example-tanstack-start.oidc-spa.dev/).

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
