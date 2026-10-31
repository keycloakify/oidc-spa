# TanStack Start Example

A minimal TanStack Start v1 example:

-   Home: `/`
-   Todo List (Server Function): `/todo-list-server-function`
-   Todo List (API): `/todo-list-api`
-   Todo List Admin: `/todo-list-admin`
-   Account: `/account`
-   Inactivity logout: `/inactivity-logout`

Both todo pages load and add per-user todos using the same store. One uses server functions protected
by `oidcFnMiddleware`; the other calls the `/api/todos` GET/POST endpoint protected by
`oidcRequestMiddleware`. Both pages are linked from the home page and navigation.
Todo List Admin lets admins view todos grouped by user ID and delete individual items.
Account displays the user's profile and provides account management actions when using Keycloak.

The account and todo pages share the pathless `src/routes/_authenticated/route.tsx` layout, which
calls `enforceLogin` once for all its children and mounts `AutoLogoutWarningOverlay`. Their URLs
do not include `_authenticated`. The home and inactivity logout pages remain public.

`AppHeader` stays in `src/routes/__root.tsx` so it can be server-rendered. The protected layout
and its children render on the client. After an automatic logout, the inactivity page offers a
link to resume the previous page, whose login guard handles sign-in when needed.

## Development

From this directory:

```sh
yarn install
yarn dev
```

Open <http://app.localhost:3000>.

To run against the local oidc-spa source, run this from the repository root:

```sh
yarn start-tanstack-start-example
```

## Production

```sh
yarn build
yarn start
```
