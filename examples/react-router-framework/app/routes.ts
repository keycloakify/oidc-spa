import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("protected", "routes/protected.tsx"),
    route("admin-only", "routes/admin-only.tsx")
] satisfies RouteConfig;
