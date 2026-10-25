import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("todo-list", "routes/todo-list.tsx"),
    route("todo-list-admin", "routes/todo-list-admin.tsx"),
    route("account", "routes/account.tsx")
] satisfies RouteConfig;
