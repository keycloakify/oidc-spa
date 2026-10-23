# TanStack Start Example

A minimal TanStack Start v1 example with three pages:

-   Home: `/`
-   Todo List: `/todo-list`
-   Todo List Admin: `/todo-list-admin`

The Todo List page loads and adds per-user todos through authenticated server functions.
Todo List Admin lets admins view todos grouped by user ID and delete individual items.

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
