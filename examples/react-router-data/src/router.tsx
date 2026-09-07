import { createBrowserRouter, redirect } from "react-router";
import { Layout } from "./Layout";
import Home from "./pages/Home";
import Protected, * as protected_ from "./pages/Protected";
import AdminOnly, * as adminOnly from "./pages/AdminOnly";

export const router = createBrowserRouter([
    {
        path: "/",
        element: <Layout />,
        children: [
            { index: true, element: <Home /> },
            { path: "protected", element: <Protected />, loader: protected_.loader },
            {
                path: "admin-only",
                element: <AdminOnly />,
                loader: adminOnly.loader,
                ErrorBoundary: adminOnly.ErrorBoundary
            },
            {
                path: "*",
                loader: () => redirect("/"),
                element: null
            }
        ]
    }
]);
