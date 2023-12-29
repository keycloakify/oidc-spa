import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./Layout";
import { ProtectedPage } from "../pages/ProtectedPage";
import { PublicPage } from "../pages/PublicPage";
import { prOidc } from "oidc";

export const router = createBrowserRouter([
    {
        path: "/",
        Component: Layout,
        children: [
            {
                path: "protected",
                Component: ProtectedPage,
                loader: protectedRouteLoader
            },
            {
                index: true,
                Component: PublicPage
            }
        ]
    }
]);

async function protectedRouteLoader() {
    const oidc = await prOidc;

    if (oidc.isUserLoggedIn) {
        return null;
    }

    await oidc.login({
        doesCurrentHrefRequiresAuth: true
    });
}
