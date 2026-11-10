import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({
    routeTree,
    scrollRestoration: true,
    // AXA loginAsync navigates immediately; avoid starting login from a hovered link.
    defaultPreload: false,
    defaultPreloadStaleTime: 0
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
