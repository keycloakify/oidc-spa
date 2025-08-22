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
 * This component is server rendered at build time.
 * This means that any component directly mounted here
 * that uses `useOidc()` should be wrapped in a `<NoSsr />`
 * boundary.
 * See the <Header /> component for reference.
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
 * <App /> is NOT server rendered at build time.
 * You can call `useOidc()` without <NoSsr /> boundaries in all the sub tree.
 * It will take the place of `{children}` in the <Layout />
 * component above.
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
 * This component will be mounted in place of <App /> in the {children}
 * placeholder of the <Layout /> component while oidc-spa is initializing.
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
