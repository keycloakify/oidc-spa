import { createBrowserRouter } from "react-router";
import { Layout } from "./Layout";
import Home from "./pages/Home";
import InactivityLogout from "./pages/InactivityLogout";
import NotFound from "./pages/NotFound";
import { AuthenticatedLayout } from "./pages/protected/AuthenticatedLayout";
import { enforceLogin } from "./oidc";

export const router = createBrowserRouter([
    {
        Component: Layout,
        HydrateFallback: () => null,
        children: [
            { index: true, Component: Home },
            { path: "inactivity-logout", Component: InactivityLogout },
            {
                Component: AuthenticatedLayout,
                middleware: [
                    async (args, next) => {
                        await enforceLogin(args);
                        return next();
                    }
                ],
                children: [
                    { path: "todo-list-trpc", lazy: () => import("./pages/protected/TodoListTrpc") },
                    { path: "todo-list-api", lazy: () => import("./pages/protected/TodoListApi") },
                    { path: "todo-list-admin", lazy: () => import("./pages/protected/TodoListAdmin") },
                    { path: "account", lazy: () => import("./pages/protected/Account") }
                ]
            },
            { path: "*", Component: NotFound }
        ]
    }
]);
