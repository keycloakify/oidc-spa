import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("inactivity-logout", "routes/inactivity-logout.tsx"),
    layout("routes/protected/layout.tsx", [
        route("todo-list", "routes/protected/todo-list.tsx"),
        route("todo-list-admin", "routes/protected/todo-list-admin.tsx"),
        route("account", "routes/protected/account.tsx")
    ])
] satisfies RouteConfig;
