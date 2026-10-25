import type { ReactNode } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import { OidcInitializationGate } from "~/oidc";
import { AppHeader } from "./components/AppHeader";
import { AutoLogoutWarningOverlay } from "./components/AutoLogoutWarningOverlay";
import "./app.css";

export function meta() {
    return [
        { title: "oidc-spa + React Router" },
        {
            name: "description",
            content: "A minimal React Router app with oidc-spa and native server loaders and actions."
        }
    ];
}

export function Layout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <Meta />
                <Links />
            </head>
            <body>
                {children}
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export default function App() {
    return (
        <OidcInitializationGate>
            <AppHeader />
            <main>
                <Outlet />
            </main>
            <AutoLogoutWarningOverlay />
        </OidcInitializationGate>
    );
}

export function HydrateFallback() {
    return null;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    const message = isRouteErrorResponse(error)
        ? error.status === 404
            ? "Page not found."
            : error.statusText || "Request failed."
        : error instanceof Error
        ? error.message
        : "An unexpected error occurred.";

    return (
        <main>
            <h1>Something went wrong</h1>
            <p role="alert">{message}</p>
            <a href="/">Back to home</a>
        </main>
    );
}
