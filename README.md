![oidc-spa](https://github.com/keycloakify/oidc-spa/assets/6702424/3375294c-cc31-4fc1-9fb5-1fcfa00423ba)

<p align="center">
    <br>
    <a href="https://github.com/keycloakify/oidc-spa/actions">
      <img src="https://github.com/keycloakify/oidc-spa/actions/workflows/ci.yaml/badge.svg?branch=main">
    </a>
    <a href="https://bundlephobia.com/package/oidc-spa">
      <img src="https://img.shields.io/bundlephobia/minzip/oidc-spa">
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

A full-featured OpenID Connect / OAuth2 client for single-page applications (SPAs).

With `oidc-spa`, you can seamlessly integrate authentication providers like [Keycloak](https://www.keycloak.org/), [Auth0](https://auth0.com/), or [Microsoft Entra ID](https://www.microsoft.com/en-us/security/business/identity-access/microsoft-entra-id) into your application.

In **simple terms**, `oidc-spa` is a library that makes it easy to **add authentication** to your Vite or Create-React-App project.  
There are many authentication and user management platforms out there: Okta, Auth0, Entra ID...  
There are also plenty of self-hosted options like Keycloak, Ory Hydra, and Dex.  
What all of these have in common is that they implement the OpenID Connect/OAuth2 standard.

This library provides a **unified way** to connect with these different providers instead of having to use
their specific SDKs.  
When a user clicks the **"Login"** button in your app, just call the `login()` method—it's that simple.

`oidc-spa` implement the **Authorization Code Flow with PKCE**, this means that **you do not need a backend** to handle the authentication process.  
The authentication process is handled entirely in the browser. No need for `/login` or `/logout` routes.

## Why `oidc-spa`?

Most OIDC providers push their own client libraries:

-   **Auth0** → `auth0-spa-js`
-   **Microsoft Entra ID** → `MSAL.js`
-   **Keycloak** → `keycloak-js` (no longer actively promoted, planned for deprecation)
-   **... and so on.**

These libraries are **tied to a specific provider**. But what if you need to:

✅ Switch OIDC providers without modifying your authentication logic?  
✅ Build a self-hostable solution that works with any provider (e.g., you're developing a dashboard app that you sell to enterprises and need to integrate with their existing IAM system)?  
✅ Stop re-learning authentication implementation every time you change providers?

And besides, not all SDKs are equal in terms of setup simplicity, performance, and API quality.

We wanted a **universal solution**—one that is as good or better than all existing SDKs in every aspect.

## Features

-   🎓 **No OIDC/OAuth2 expertise required**: Easy to setup and use. We're here to help [on Discord](https://discord.gg/mJdYJSdcm4)!
-   🛠️ **Simple setup**: No need to define `/login` or `/logout` routes—token refreshing is automatic, it just works.
-   ✨ **React integration**: Expose a framework agnostic API (`oidc-spa`) but also a React adapter `oidc-spa/react`.
-   🔥 **No limitation**- For example, everything you could do with `keycloak-js`, you can do with `oidc-spa`.
-   💬 **Detailed debug messages**: If your OIDC server is not properly configured, it tells you precisely what’s wrong and what you need to do to fix it.
-   🕣 **Auto logout with countdown**: "You will be logged out in 10... 9... 8..."—users see exactly when their session expires.
-   🚪 **Logout propagation**: Logging out in one tab logs out all others.
-   📖 **Comprehensive documentation**: Guides and examples for common scenarios.
-   ✅ **Type safety**: Strong TypeScript support with optional [Zod](https://zod.dev/) integration validating the expected shape of the ID token.
-   🔒 **Security-first**: Uses **Authorization Code Flow + PKCE**—No token persistence in `localStorage` or `sessionStorage`.
-   🖥️ **Optional backend utilities**: Provides tools for token validation in JavaScript backends (Node.js, Deno, Web Workers).
-   🔗 **Multi-instance support**: Run multiple `oidc-spa` instances—for example, to offer **Login with Google OR Microsoft** in the same app.
-   🍪 **No third-party cookie issues**: Third-party cookies blocked? No problem—`oidc-spa` works around it automatically with no special measures needed on your side.

## Comparison with Existing Libraries

### [oidc-client-ts](https://github.com/authts/oidc-client-ts)

While `oidc-client-ts` is a comprehensive toolkit designed for various applications, `oidc-spa` is specifically built for SPAs with an easy-to-set-up API.  
But **ease of use** isn't the only difference—`oidc-spa` also provides **out-of-the-box** solutions for features that `oidc-client-ts` leaves up to you to implement, such as:

-   **Login/logout propagation** across tabs
-   **Graceful fallback when third-party cookies are blocked**
-   **Seamless browser back/forward cache (bfcache) management**
-   **Auto logout countdown** so users can be automatically logged out after a set period of inactivity.
-   **Ensuring you never get an expired access token error**—even after the computer wakes up from sleep.
-   **Gracefully handles scenarios where the provider does not issue a refresh token or lacks a logout endpoint** (e.g., Google OAuth)

### [react-oidc-context](https://github.com/authts/react-oidc-context)

`react-oidc-context` is a React wrapper around `oidc-client-ts`.  
`oidc-spa` also feature a carefully crafted React API that comes with [working examples that you can test locally](https://docs.oidc-spa.dev/example-setups/example-setups).

### [keycloak-js](https://www.npmjs.com/package/keycloak-js)

The official OIDC Client for Keycloak. It only works with Keycloak and [will eventually be deprecated](https://www.keycloak.org/2023/03/adapter-deprecation-update).  
Beyond that, achieving the same seamless user experience as `oidc-spa` with `keycloak-js` requires writing a lot of custom code—code that really **shouldn’t** be handled at the application level.

### [NextAuth.js](https://next-auth.js.org/)

Since oidc-spa is built for true SPAs, Next.js applications should use NextAuth.js instead.

> _NOTE: We might create in the future a `oidc-mpa` library for Multi Page Applications that would aim at supporting Next.js projects._

## 🚀 Quick start

Head over to [the documentation website](https://docs.oidc-spa.dev) 📘!

## Sponsors

Project backers, we trust and recommend their services.

<br/>

<div align="center">

![Logo Dark](https://github.com/user-attachments/assets/d8f6b6f5-3de4-4adc-ba15-cb4074e8309b#gh-dark-mode-only)

</div>

<div align="center">

![Logo Light](https://github.com/user-attachments/assets/20736d6f-f22d-4a9d-9dfe-93be209a8191#gh-light-mode-only)

</div>

<br/>

<p align="center">
    <i><a href="https://phasetwo.io/?utm_source=keycloakify"><strong>Keycloak as a Service</strong></a> - Keycloak community contributors of popular <a href="https://github.com/p2-inc#our-extensions-?utm_source=keycloakify">extensions</a> providing free and dedicated <a href="https://phasetwo.io/hosting/?utm_source=keycloakify">Keycloak hosting</a> and enterprise <a href="https://phasetwo.io/support/?utm_source=keycloakify">Keycloak support</a> to businesses of all sizes.</i>
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
    <i><strong>Keycloak Consulting Services</strong> - Your partner in Keycloak deployment, configuration, and extension development for optimized identity management solutions.</i>
  </a>
</p>

## Showcases

This library powers the authentication of the following platforms:

### Onyxia

-   [Source code](https://github.com/InseeFrLab/onyxia)
-   [Public instance](https://datalab.sspcloud.fr)

<a href="https://youtu.be/FvpNfVrxBFM">
  <img width="1712" alt="image" src="https://user-images.githubusercontent.com/6702424/231314534-2eeb1ab5-5460-4caa-b78d-55afd400c9fc.png">
</a>

### The French Interministerial Base of Free Software

-   [Source code](https://github.com/codegouvfr/sill-web/)
-   [Deployment of the website](https://sill-preprod.lab.sspcloud.fr/)

<a href="https://youtu.be/AT3CvmY_Y7M?si=Edkf0vRNjosGLA3R">
  <img width="1712" alt="image" src="https://github.com/garronej/i18nifty/assets/6702424/aa06cc30-b2bd-4c8b-b435-2f875f53175b">
</a>
