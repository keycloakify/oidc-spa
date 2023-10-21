<p align="center">
    <img src="https://user-images.githubusercontent.com/6702424/80216211-00ef5280-863e-11ea-81de-59f3a3d4b8e4.png">  
</p>
<p align="center">
    <i>Openidconnect client for Single Page Applications</i>
    <br>
    <br>
    <a href="https://github.com/garronej/oidc-spa/actions">
      <img src="https://github.com/garronej/oidc-spa/workflows/ci/badge.svg?branch=main">
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

An OIDC client for Single Page Applications that comes with an optional adapter for React.  
Very minimal API surface, you don't need to know the in and out of oidc or OAuth to use this.

Why not oidc-client-ts ?

-   `oidc-client-ts` more a toolkit than a ready to use adapter. This lib use it internally but abstract away most of it's complexity.
-   It's used under the hood by this lib but it's hard to setup directly in a SPA setup especially the silent SSO.
-   It's more resilient do misconfigured server.
-   It restrict what params can be passed on the url when redirecting to the login page.

Why not react-oidc-context?

-   There's no overlap between OIDC and React. Not everything should be though as a React problem. Oidc and React are
    completely different problem space they have no business being intertwined.  
    This library provide an optional React adapter for convenience in the spirit of being truly ready to use but don't
    get mistaken, it's trivial you could as well do without it.

# Install / Import

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

# Usage

## Isolated from the UI library

```ts
import { createOidc, decodeJwt } from "oidc-spa";

(async () => {
    const oidc = await createOidc({
        issuerUri: "https://auth.your-domain.net/auth/realms/myrealm",
        clientId: "myclient",
        // Optional, you can modify the url before redirection to the identity server
        transformUrlBeforeRedirect: url => `${url}&ui_locales=fr`
        /** Optional: Provide only if your app is not hosted at the origin  */
        //silentSsoUrl: `${window.location.origin}/foo/bar/baz/silent-sso.html`,
    });

    if (oidc.isUserLoggedIn) {
        // This return a promise that never resolve. Your user will be redirected to the identity server.
        // If you are calling login because the user clicked
        // on a 'login' button you should set doesCurrentHrefRequiresAuth to false.
        // When you are calling login because your user navigated to a path that require authentication
        // you should set doesCurrentHrefRequiresAuth to true
        oidc.login({ doesCurrentHrefRequiresAuth: false });
    } else {
        const {
            // The accessToken is what you'll use a a Bearer token to authenticate to your APIs
            accessToken,
            // You can parse the idToken as a JWT to get some information about the user.
            idToken
        } = oidc.getTokens();

        const { sub, preferred_username } = decodeJwt<{
            // Use https://jwt.io/ to tell what's in your idToken
            sub: string;
            preferred_username: string;
        }>(idToken);

        // To call when the user click on logout.
        oidc.logout();
    }
})();
```

## Use via React Adapter

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
                <button onClick={() => oidc.login({ doesCurrentHrefRequiresAuth: false })}>
                    Login now
                </button>
            </>
        );
    }

    const { preferred_username } = decodeJwt<{
        preferred_username: string;
    }>(oidc.getTokens().idToken);

    return (
        <>
            <h1>Hello {preferred_username}</h1>
            <button onClick={() => oidc.logout()}>Log out</button>
        </>
    );
}
```

# Setup example

-   Basic setup: https://github.com/keycloakify/keycloakify-starter
-   Fully fledged app: https://github.com/InseeFrLab/onyxia

# Contributing

## Testing your changes in an external app

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

## Releasing

For releasing a new version on GitHub and NPM you don't need to create a tag.  
Just update the `package.json` version number and push.

For publishing a release candidate update your `package.json` with `1.3.4-rc.0` (`.1`, `.2`, ...).  
It also work if you do it from a branch that have an open PR on main.

> Make sure your have defined the `NPM_TOKEN` repository secret or NPM publishing will fail.
