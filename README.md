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

An Open ID Connect client tailored for Single Page Applications, particularly suitable for [Vite](https://vitejs.dev/) projects.\
This library is intended for scenarios such as integrating your application with [Keycloak](https://www.keycloak.org/). &#x20;

In straightforward terms, this library is ideal for those seeking to enable user login/registration in their web application. When used in conjunction with Keycloak (for example), it enables you to offer a modern and secure authentication experience with minimal coding effort. This includes options for signing in via Google, X, GitHub, or other social media platforms. We provide comprehensive guidance from beginning to end.

-   🎓 Accessible to all skill levels; no need to be an OIDC expert. And we are here to help [on Discord](https://discord.gg/mJdYJSdcm4).
-   🛠️ Easy to set up; eliminates the need for creating special `/login` `/logout` routes.
-   💬 Helpful debug message telling you what's wrong in your configuration and how to fix it.
-   🎛️ Minimal API surface for ease of use.
-   🕣 Easy implementation of auto logout. _Are you still there? You will be logged out in 10...9..._
-   ✨ Robust yet optional React integration.
-   📖 Comprehensive documentation and project examples: End-to-end solutions for authenticating your app.
-   ✅ Best in class type safety: Enhanced API response types based on usage context.

## Comparison with Existing Libraries

### [oidc-client-ts](https://github.com/authts/oidc-client-ts)

While `oidc-client-ts` serves as a comprehensive toolkit, our library aims to provide a simplified, ready-to-use adapter that will pass
any security audit and that will just work out of the box on any browser.  
We utilize `oidc-client-ts` internally but abstract away most of its intricacies.

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
`oidc-spa` is specifically designed for Single Page Applications, Next.js projects do not call in this category, so NextAuth.js is what you should use if you're using Next.js.

> _NOTE: We might create in the future a `oidc-mpa` library for Multi Page Applications that would aim at supporting Next.js projects._

## 🚀 Quick start

Heads over to [the documentation website](https://docs.oidc-spa.dev) 📘!

## Sponsor

<br/>

<div align="center">

![Logo Dark](https://github.com/user-attachments/assets/935c0f10-6f7b-41f4-94cc-4540d0985569#gh-dark-mode-only)

</div>

<div align="center">

![Logo Light](https://github.com/user-attachments/assets/2e5bce29-4149-44fc-9d17-789e17e9642b#gh-light-mode-only)

</div>

<br/>

<p align="center">
  <a href="https://www.zone2.tech/services/keycloak-consulting">
    <i><strong>Keycloak Consulting Services</strong> - Your partner in Keycloak deployment, configuration, and extension development for optimized identity management solutions.</i>
  </a>
</p>

Thank you, [Zone2](https://www.zone2.tech/), backing the project!

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
