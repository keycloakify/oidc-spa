<p align="center">
    <img src="https://github.com/garronej/oidc-spa/assets/6702424/6adde1f7-b7b6-4b1a-b48f-bd02095b99ea">  
</p>
<p align="center">
    <i>Openidconnect client for Single Page Applications</i>
    <br>
    <br>
    <a href="https://github.com/garronej/oidc-spa/actions">
      <img src="https://github.com/garronej/oidc-spa/actions/workflows/ci.yaml/badge.svg?branch=main">
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
  <a href="https://github.com/garronej/oidc-spa">Home</a>
  -
  <a href="https://github.com/garronej/oidc-spa">Documentation</a>
</p>

An OIDC client designed for Single Page Applications, typically [Vite](https://vitejs.dev/) projects.
With a streamlined API, you can easily integrate OIDC without needing to understand every detail of the protocol.

## Comparison with Existing Libraries

### [oidc-client-ts](https://github.com/authts/oidc-client-ts)

While `oidc-client-ts` serves as a comprehensive toolkit, our library aims to provide a simplified, ready-to-use adapter that will pass
any security audit. We utilize `oidc-client-ts` internally but abstract away most of its intricacies.

### [react-oidc-context](https://github.com/authts/react-oidc-context)

Our library takes a modular approach to OIDC and React, treating them as separate concerns that don't necessarily have to be intertwined.
We offer an optional React adapter for added convenience, but it's not a requirement to use it and [it's really trivial anyway](https://github.com/garronej/oidc-spa/blob/main/src/react.tsx).

## Usage

```bash
$ yarn add oidc-spa
```

Create a `silent-sso.html` file and put it in your public directory.

```html
<html>
    <body>
        <script>
            parent.postMessage(location.href, location.origin);
        </script>
    </body>
</html>
```

### Option 1: Usage without involving the UI framework

```ts
import { createOidc, decodeJwt } from "oidc-spa";

(async () => {
    const oidc = await createOidc({
        issuerUri: "https://auth.your-domain.net/auth/realms/myrealm",
        clientId: "myclient",
        // Optional, you can modify the url before redirection to the identity server
        // Alternatively you can use: getExtraQueryParams: ()=> ({ ui_locales: "fr" })
        transformUrlBeforeRedirect: url => `${url}&ui_locales=fr`
        /**
         * This parameter have to be provided if your App is not hosted at the origin of the subdomain.
         * For example if your site is hosted by navigating to `https://www.example.com`
         * you don't have to provide this parameter.
         * On the other end if your site is hosted by navigating to `https://www.example.com/my-app`
         * Then you want to set publicUrl to `/my-app`.
         * If you are using Vite: `publicUrl: import.meta.env.BASE_URL`
         * If you using Create React App: `publicUrl: process.env.PUBLIC_URL`
         *
         * Be mindful that `${window.location.origin}${publicUrl}/silent-sso.html` must return the `silent-sso.html` that
         * you are supposed to have created in your `public/` directory.
         */
        //publicUrl: `${window.location.origin}/my-app`
    });

    if (!oidc.isUserLoggedIn) {
        // This return a promise that never resolve. Your user will be redirected to the identity server.
        oidc.login({
            // doesCurrentHrefRequiresAuth determines the behavior when a user gives up on loggin in and navigate back.
            // We don't want to send him back to a authenticated route.
            // If you are calling login because the user clicked
            // on a 'login' button you should set doesCurrentHrefRequiresAuth to false.
            // When you are calling login because your user navigated to a path that require authentication
            // you should set doesCurrentHrefRequiresAuth to true
            doesCurrentHrefRequiresAuth: false
            //Optionally you can add some extra parameter to be added on the login url.
            //extraQueryParams: { kc_idp_hint: "google" }
        });
    } else {
        const {
            // The accessToken is what you'll use as a Bearer token to authenticate to your APIs
            accessToken,
            // You can parse the idToken as a JWT to get some information about the user.
            idToken
        } = oidc.getTokens();

        const user = decodeJwt<{
            // Use https://jwt.io/ to tell what's in your idToken
            sub: string;
            preferred_username: string;
        }>(idToken);

        console.log(`Hello ${user.preferred_username}`);

        // To call when the user click on logout.
        // You can also redirect to a custom url with { redirectTo: "specific url", url: `${location.origin}/bye` }
        oidc.logout({ redirectTo: "home" });
    }
})();
```

## Option 2: Usage directly within React

```tsx
import { createOidcProvider, useOidc } from "oidc-spa/react";
import { decodeJwt } from "oidc-spa";

const { OidcProvider } = createOidcProvider({
    issuerUri: "https://auth.your-domain.net/auth/realms/myrealm",
    clientId: "myclient"
    // See above for other parameters
});

ReactDOM.render(
    <OidcProvider
        // Optional, it's usually so fast that a fallback is really not required.
        fallback={<>Logging you in...</>}
    >
        <App />
    </OidcProvider>,
    document.getElementById("root")
);

function App() {
    const { oidc } = useOidc();

    if (!oidc.isUserLoggedIn) {
        return (
            <>
                You're not logged in.
                <button
                    onClick={() =>
                        oidc.login({
                            doesCurrentHrefRequiresAuth: false
                            //Optionally you can add some extra parameter to be added on the login url.
                            //extraQueryParams: { kc_idp_hint: "google" }
                        })
                    }
                >
                    Login
                </button>
            </>
        );
    }

    return (
        <AppLoggedIn
            // You can also redirect to a custom url with { redirectTo: "specific url", url: `${location.origin}/bye` }
            logout={() => oidc.logout({ redirectTo: "home" })}
        />
    );
}

function AppLoggedIn(props: { logout: () => Promise<never> }) {
    const { logout } = props;

    const { user } = useUser();

    return (
        <>
            <h1>Hello {user.preferred_username}</h1>
            <button onClick={logout}>Log out</button>
        </>
    );
}

// Convenience hook to get the parsed idToken
// To call only when the user is logged in
function useUser() {
    const { oidc } = useOidc();

    if (!oidc.isUserLoggedIn) {
        throw new Error("This hook should be used only on authenticated routes");
    }

    const { idToken } = oidc.getTokens();

    const user = useMemo(
        () =>
            decodeJwt<{
                // Use https://jwt.io/ to tell what's in your idToken
                sub: string;
                preferred_username: string;
            }>(idToken),
        [idToken]
    );

    return { user };
}
```

## Refreshing token

The token refresh is handled automatically for you, however you can manually trigger
a token refresh with `oidc.getTokens()`.

## What happens if the OIDC server is down?

If the OIDC server is down or misconfigured an error get printed in the console, everything
continues as normal with the user unauthenticated. If the user tries to login an alert saying
that authentication is not available at the moment is displayed and nothing happens.  
This enable your the part of your app that do not requires authentication to remain up even when
your identities server is facing issues.

## Demo setup

<p align="center">
  <img width="764" alt="image" src="https://github.com/garronej/oidc-spa/assets/6702424/1c8922de-d724-4e9d-b630-e82562449612">
</p>

A very basic setup with Keycloak and Create React App.

-   It's live here: https://starter.keycloakify.dev/
-   The source code is [here](https://github.com/keycloakify/keycloakify-starter).
    The setup is collocated with a custom Keycloak theme. The part where we use `oidc-spa` is [here](https://github.com/keycloakify/keycloakify-starter/blob/main/src/App/App.tsx).

## Showcases

This library is powers the authentication of the following platforms:

### Onyxia

-   [Source code](https://github.com/InseeFrLab/onyxia)
-   [Public instance](https://datalab.sspcloud.fr)

<a href="https://youtu.be/FvpNfVrxBFM">
  <img width="1712" alt="image" src="https://user-images.githubusercontent.com/6702424/231314534-2eeb1ab5-5460-4caa-b78d-55afd400c9fc.png">
</a>

### The French Interministerial Base of Free Software

-   [Source code](https://github.com/codegouvfr/sill-web/)
-   [Deployment of the website](https://code.gouv.fr/sill)

<a href="https://youtu.be/AT3CvmY_Y7M?si=Edkf0vRNjosGLA3R">
  <img width="1712" alt="image" src="https://github.com/garronej/i18nifty/assets/6702424/aa06cc30-b2bd-4c8b-b435-2f875f53175b">
</a>

## Contributing

### Testing your changes in an external app

You have made some changes to the code and you want to test them
in your app before submitting a pull request?

Assuming `you/my-app` have `oidc-spa` as a dependency.

```bash
cd ~/github
git clone https://github.com/you/my-app
cd my-app
yarn

cd ~/github
git clone https://github.com/garronej/oidc-spa
cd oidc-spa
yarn
yarn build
yarn link-in-app my-app
npx tsc -w

# Open another terminal

cd ~/github/my-app
rm -rf node_modules/.cache
yarn start # Or whatever my-app is using for starting the project
```

You don't have to use `~/github` as reference path. Just make sure `my-app` and `oidc-spa`
are in the same directory.

> Note for the maintainer: You might run into issues if you do not list all your singleton dependencies in
> `src/link-in-app.js -> singletonDependencies`. A singleton dependency is a dependency that can
> only be present once in an App. Singleton dependencies are usually listed as peerDependencies example `react`, `@emotion/*`.
