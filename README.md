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

An Open ID Connect client for single page applications, particularly suitable for [Vite](https://vitejs.dev/) projects.  
This library is for integrating your application with OIDC Server like [Keycloak](https://www.keycloak.org/), [Ory Hydra](https://www.ory.sh/hydra/) or [Dex](https://dexidp.io/). &#x20;

In straightforward terms, oidc-spa enable login/registration in your web application.  
When used in conjunction with Keycloak (for example),
it enables you to offer a modern and secure authentication experience with minimal coding effort.  
This includes options for signing in via Google, X, GitHub, or other social media platforms. We provide comprehensive guidance from beginning to end.

-   🎓 **Accessible to all skill levels**: No need to be an authentication expert. And we're happy to help [on Discord](https://discord.gg/mJdYJSdcm4)!
-   🛠️ **Simple setup**: No need to define `/login` or `/logout` routes. Token refreshing is handled automatically.
-   💬 **Debug messages**: Provides clear feedback on misconfigurations and how to resolve them.
-   🕣 **Auto logout**: Supports session expiration with automatic logout prompts.
-   🚪 **Logout propagation**: Logging out in one tab automatically logs out all others.
-   ✨ **React integration**: Includes React utilities but works independently as well.
-   📖 **Documentation & examples**: Covers setup, usage, and common scenarios.
-   ✅ **Type safety**: Strong TypeScript support with optional Zod integration for JWT validation.
-   🔒 **Security**: Uses Authorization Code Flow + PKCE. No token storage in `localStorage` or `sessionStorage`.
-   🖥️ **Optional Backend tooling**: Provides utilities for access token validation in JavaScript backends (Node, Deno, WebWorker).
-   🔗 **Multi-instance support**: Allows authentication against multiple APIs (using different OIDC clients) within the same application.

## Comparison with Existing Libraries

### [oidc-client-ts](https://github.com/authts/oidc-client-ts)

While `oidc-client-ts` serves as a comprehensive toolkit to support all sort of applications, our library aims to provide a simplified, easy-to-setup adapter
specifically tailored for SPAs.

### [react-oidc-context](https://github.com/authts/react-oidc-context)

`react-oidc-context` is a React wrapper around `oidc-client-ts`.  
`oidc-spa` also feature a carefully crafted React API that comes with example
integration with:

-   [`@tanstack/react-router`](https://docs.oidc-spa.dev/example-setups/tanstack-router)
-   [`react-router-dom`](https://docs.oidc-spa.dev/example-setups/react-router)

### [keycloak-js](https://www.npmjs.com/package/keycloak-js)

The official OIDC Client for Keycloak. It only works with Keycloak and [will eventually be deprecated](https://www.keycloak.org/2023/03/adapter-deprecation-update).

### [NextAuth.js](https://next-auth.js.org/)

NextAuth.js is a authentication solution for Next.js and features a [Keycloak adapter](https://next-auth.js.org/providers/keycloak).  
`oidc-spa` is specifically designed for Single Page Applications, Next.js projects **do not** fall in this category, so NextAuth.js is what you should use if you're using Next.js.

> _NOTE: We might create in the future a `oidc-mpa` library for Multi Page Applications that would aim at supporting Next.js projects._

## 🚀 Quick start

Heads over to [the documentation website](https://docs.oidc-spa.dev) 📘!

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
