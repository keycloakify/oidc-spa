# TanStack Start Example

A minimal TanStack Start v1 example with five pages:

-   Home: `/`
-   Todo List (Server Function): `/todo-list-server-function`
-   Todo List (API): `/todo-list-api`
-   Todo List Admin: `/todo-list-admin`
-   Account: `/account`

Both todo pages load and add per-user todos using the same store. One uses server functions protected
by `oidcFnMiddleware`; the other calls the `/api/todos` GET/POST endpoint protected by
`oidcRequestMiddleware`. Both pages are linked from the home page and navigation.
Todo List Admin lets admins view todos grouped by user ID and delete individual items.
Account displays the user's profile and provides account management actions when using Keycloak.

## Development

From this directory:

```sh
yarn install
yarn dev
```

Open <http://localhost:3000>.

To run against the local oidc-spa source, run this from the repository root:

```sh
yarn start-tanstack-start-next-example
```

## Production

```sh
yarn build
yarn start
```
