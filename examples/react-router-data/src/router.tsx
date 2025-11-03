import { createBrowserRouter, Outlet, redirect } from "react-router";
import { Header } from "./components/Header";
import { AutoLogoutWarningOverlay } from "./components/AutoLogoutWarningOverlay";
import Home from "./pages/Home";
import Protected, * as protected_ from "./pages/Protected";
import AdminOnly, * as adminOnly from "./pages/AdminOnly";

function Layout() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
            <Header />
            <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 pb-16 pt-28">
                <Outlet />
            </main>
            <AutoLogoutWarningOverlay />
        </div>
    );
}

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
