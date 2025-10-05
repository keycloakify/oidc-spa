import { type RouteConfig } from "@mateothegreat/svelte5-router";
import { enforceLogin, getOidc } from "./oidc";
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
                return enforceLogin({
                    location: { href: `${window.origin}/${route.result.path.original}` }
                });
            }
        }
    }
];
