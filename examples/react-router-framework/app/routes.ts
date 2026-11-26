import { type RouteConfig, layout, prefix } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

export default [
    ...(await flatRoutes()),
    ...prefix("api", await flatRoutes({ rootDirectory: "routes/api" })),
    // Discover authenticated pages inside their own directory and wrap them once.
    layout(
        "routes/_auth/layout.tsx",
        await flatRoutes({
            rootDirectory: "routes/_auth",
            ignoredRouteFiles: ["**/layout.tsx"]
        })
    )
] satisfies RouteConfig;
