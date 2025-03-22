import { lazy } from "react";
import { Layout } from "./Layout";
import { enforceLogin } from "../oidc";

import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

const rootRoute = createRootRoute({ component: Layout });
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: lazy(() => import("../pages/PublicPage"))
});
const protectedRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "protected",
    beforeLoad: async () => {
        await enforceLogin();
    },
    component: lazy(() => import("../pages/ProtectedPage"))
});

const routeTree = rootRoute.addChildren([indexRoute, protectedRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
