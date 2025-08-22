import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import { AutoLogoutWarningOverlay } from "./components/AutoLogoutWarningOverlay";
import { Header } from "./components/Header";
import { OidcInitializationErrorIfAny } from "./components/OidcInitializationErrorIfAny";
import "./app.css";

export const links: Route.LinksFunction = () => [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous"
    },
    {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
    }
];

/**
 * This component is server-rendered at build time.
 * Any component directly rendered here that calls `useOidc()`
 * must be wrapped in a `<ClientOnly />` boundary to prevent errors.
 * See the <Header /> component for an example.
 */
export function Layout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <Meta />
                <Links />
            </head>
            <body>
                <Header />
                {children}
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

/**
 * <App /> is client-rendered (not rendered by node at compile time).
 * It replaces the `{children}` placeholder in <Layout />.
 * Inside this subtree, you can call `useOidc()` freely without wrapping in <ClientOnly />.
 */
export default function App() {
    return (
        <>
            <main style={{ width: "100%", textAlign: "center", margin: "0 auto" }}>
                {/*You do not have to display an error here, it's just to 
                show that if you want you can implement custom OIDC initialization 
                error handling.*/}
                <OidcInitializationErrorIfAny />
                <Outlet />
            </main>
            <AutoLogoutWarningOverlay />
        </>
    );
}

/**
 * Shown in place of <App /> within <Layout /> while oidc-spa is initializing.
 */
export function HydrateFallback() {
    return (
        <div style={{ display: "flex", width: "100%", justifyContent: "center", alignItems: "center" }}>
            <p>Loading oidc and hydrating client...</p>
        </div>
    );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    let message = "Oops!";
    let details = "An unexpected error occurred.";
    let stack: string | undefined;

    if (isRouteErrorResponse(error)) {
        message = error.status === 404 ? "404" : "Error";
        details =
            error.status === 404
                ? "The requested page could not be found."
                : error.statusText || details;
    } else if (import.meta.env.DEV && error && error instanceof Error) {
        details = error.message;
        stack = error.stack;
    }

    return (
        <main>
            <h1>{message}</h1>
            <p>{details}</p>
            {stack && (
                <pre className="w-full p-4 overflow-x-auto">
                    <code>{stack}</code>
                </pre>
            )}
        </main>
    );
}
