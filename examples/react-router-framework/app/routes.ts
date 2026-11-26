import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("inactivity-logout", "routes/inactivity-logout.tsx"),
    route("api/todos", "routes/api.todos.ts"),
    route("api/trpc/*", "routes/api.trpc.ts"),
    layout("routes/protected/layout.tsx", [
        route("todo-list", "routes/protected/todo-list.tsx"),
        route("todo-list-api", "routes/protected/todo-list-api.tsx"),
        route("todo-list-trpc", "routes/protected/todo-list-trpc.tsx"),
        route("todo-list-admin", "routes/protected/todo-list-admin.tsx"),
        route("account", "routes/protected/account.tsx")
    ])
] satisfies RouteConfig;
