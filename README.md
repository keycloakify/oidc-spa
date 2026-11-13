![oidc-spa](https://github.com/keycloakify/oidc-spa/assets/6702424/3375294c-cc31-4fc1-9fb5-1fcfa00423ba)

<p align="center">
    <br>
    <a href="https://github.com/keycloakify/oidc-spa/actions">
      <img src="https://github.com/keycloakify/oidc-spa/actions/workflows/ci.yaml/badge.svg?branch=main">
    </a>
    <a href="https://www.npmjs.com/package/oidc-spa">
      <img src="https://img.shields.io/npm/dw/oidc-spa">
    </a>
    <a href="https://npmgraph.js.org/?q=oidc-spa">
      <img src="https://depx.co/api/badge/oidc-spa">
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

oidc-spa is an OpenID Connect client built for browser-first apps.  
It wraps the full Authorization Code + PKCE flow in a high-level API so you can ship secure app auth without stitching together multiple SDKs and ad-hoc glue.

-   🔒 Security-first defaults: in-memory tokens, strict redirect handling, and opt-in defenses like [DPoP](https://docs.oidc-spa.dev/v/v10/security-features/dpop)
    and [token substitution](https://docs.oidc-spa.dev/docs/v9/security-features/token-substitution) to reduce token exposure risk.
-   🧭 Battle-tested auth UX: token renewal, idle timeout, auto login/logout, multi-tab session sync, and reliable session restore on reload.
-   🧩 Full-stack ready: [backend token validation utilities](https://docs.oidc-spa.dev/v/v10/integration-guides/backend-token-validation) and [first-class TanStack Start integration](https://docs.oidc-spa.dev/v/v10/integration-guides/tanstack-router-start/tanstack-start) in the same library.
-   🧰 Provider-aware: handles real-world quirks across Keycloak, Entra ID, Auth0, Google, and more.
-   ✨ Developer experience: types flow from config into the API, minimal knobs, and easy-to-mock auth for tests.

[Get Started](https://docs.oidc-spa.dev)

## At a glance

The Framework-Agnostic Adapter:

```ts
import { oidcSpa } from "oidc-spa/framework-agnostic";
import { oidcEarlyInit } from "oidc-spa";
import { z } from "zod"; // 59 KB min+gzip, but it's optional.

// Call this only if you don't use oidc-spa's Vite plugin.
const { shouldLoadApp } = oidcEarlyInit({ BASE_URL: "/" });

// App specific representation of the user.
// Shape it around the information the UI needs to render.
type User = {
    displayName: string;
    avatarImgUrl: string;
    canSeeAdminNavigation: boolean;
};

if (shouldLoadApp) {
    const { getOidc } = oidcSpa
        .withUser<User>(async ({ isMock, idTokenClaims }) => {
            // Construct the representation of the user using:
            // - The ID Token Claims
            // - The Access Token Claims (supposed to be opaque to the client but hey...)
            // - Fetching your own protected /api/user endpoint using accessToken.
            // - Fetching the userinfo endpoint using fetchUserInfo().
            // - ...

            if (isMock) {
                return {
                    displayName: "John Doe",
                    avatarImgUrl: "/anonymous.svg",
                    canSeeAdminNavigation: true
                };
            }
            const { name, picture, roles } = z
                .object({
                    name: z.string(),
                    picture: z.string().optional(),
                    roles: z.array(z.string()).optional()
                })
                .parse(idTokenClaims);

            return {
                displayName: name,
                avatarImgUrl: picture ?? "/anonymous.svg",
                canSeeAdminNavigation: roles?.includes("admin") ?? false
            };
        })
        .withRuntimeConfigs(async () => ({
            mode: "real", // Use mode: "mock" for development without an auth server.
            issuerUri: "https://auth.my-domain.net/realms/myrealm",
            clientId: "myclient"
            // The Redirect URI (callback URL) is the root URL of your app.
        }))
        .createUtils();

    const oidc = await getOidc();

    // In oidc-spa the user is either logged in or they aren't.
    // The state will never mutate without a full app reload.
    // This makes reasoning about auth much, much easier.
    if (!oidc.isUserLoggedIn) {
        await oidc.login({ doesCurrentHrefEnforceLogin: true });
        // Never here
    } else {
        const user = await oidc.getUser();

        console.log(`Hello ${user.displayName}`);

        const { accessToken } = await oidc.getTokens();

        const todos = await fetch("/api/todos", {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        }).then(r => r.json());
    }
}
```

For a complete app using this adapter with Vue and Vue Router, see
the [framework-agnostic example](examples/framework-agnostic).

Higher-level adapters, example with React but we also feature a similar Angular adapter:

<img width="1835" height="942" alt="Image" src="https://github.com/user-attachments/assets/a7a18bbc-998a-459c-8cfa-93b599a45524" />

Full-stack auth solution with TanStack Start:

```tsx
import { createServerFn } from "@tanstack/react-start";
import { enforceLogin, oidcFnMiddleware } from "@/oidc";
import fs from "node:fs/promises";

const getTodos = createServerFn({ method: "GET" })
    .middleware([oidcFnMiddleware({ require: "authed request" })])
    .handler(async ({ context: { oidc } }) => {
        const json = await fs.readFile(`todos_${oidc.user.id}.json`, "utf8");

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
    <i><a href="https://phasetwo.io/?utm_source=keycloakify"><strong>Keycloak as a Service</strong></a> — Keycloak community contributors of popular <a href="https://github.com/p2-inc#our-extensions-?utm_source=keycloakify">extensions</a> providing free and dedicated <a href="https://phasetwo.io/hosting/?utm_source=keycloakify">Keycloak hosting</a> and enterprise <a href="https://phasetwo.io/support/?utm_source=keycloakify">Keycloak support</a> to businesses of all sizes.</i>
</p>
