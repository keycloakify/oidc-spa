import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import { AutoLogoutWarningOverlay } from "./components/AutoLogoutWarningOverlay";
import { Header } from "./components/Header";
import { useOidc } from "~/oidc";
import "./tailwind.css";

export function Layout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <Meta />
                <Links />
            </head>
            <body className="bg-slate-950 text-slate-100 antialiased">
                {children}
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

/**
 * `<App />` is injected as `{children}` in `<Layout />` `once oidc is initialized.
 */
export default function App() {
    const { isOidcReady } = useOidc();

    if (!isOidcReady) {
        return null;
    }

    return (
        <>
            <div className="min-h-screen">
                <Header />
                <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 pb-16 pt-28">
                    <Outlet />
                </main>
            </div>
            <AutoLogoutWarningOverlay />
        </>
    );
}

export function HydrateFallback() {
    return null;
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
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-3 px-6 text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-white">{message}</h1>
            <p className="text-base text-slate-300">{details}</p>
            {stack && (
                <pre className="w-full overflow-x-auto rounded-lg bg-slate-900/90 p-4 text-left text-sm text-slate-100">
                    <code>{stack}</code>
                </pre>
            )}
        </main>
    );
}
