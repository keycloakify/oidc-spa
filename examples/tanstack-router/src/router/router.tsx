import { Layout } from "./Layout";
import { ProtectedPage } from "../pages/ProtectedPage";
import { PublicPage } from "../pages/PublicPage";
import { getOidc } from "oidc";

import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

const rootRoute = createRootRoute({ component: Layout });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: PublicPage });
const protectedRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "protected",
    component: ProtectedPage,
    beforeLoad: protectedRouteLoader
});

const routeTree = rootRoute.addChildren([indexRoute, protectedRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

async function protectedRouteLoader() {
    const oidc = await getOidc();

    if (oidc.isUserLoggedIn) {
        return null;
    }

    await oidc.login({
        doesCurrentHrefRequiresAuth: true
    });
}
