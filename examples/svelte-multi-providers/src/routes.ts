import { type RouteConfig } from "@mateothegreat/svelte5-router";
import { beforeLoad_protectedRoute } from "./oidc";
import ProtectedPage from "./pages/ProtectedPage.svelte";
import PublicPage from "./pages/PublicPage.svelte";

export const routes: RouteConfig[] = [
    {
        component: PublicPage
    },
    {
        path: "protected",
        component: ProtectedPage,
        hooks: {
            pre: async route => {
                return beforeLoad_protectedRoute({ cause: "" });
            }
        }
    }
];
