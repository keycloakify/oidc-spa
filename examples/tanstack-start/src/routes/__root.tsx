import { HeadContent, Scripts, createRootRoute, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppHeader } from "#/components/AppHeader";
import { AutoLogoutWarningOverlay } from "#/components/AutoLogoutWarningOverlay";
import stylesheetUrl from "#/styles.css?url";

export const Route = createRootRoute({
    head: () => ({
        meta: [
            {
                charSet: "utf-8"
            },
            {
                name: "viewport",
                content: "width=device-width, initial-scale=1"
            },
            {
                title: "TanStack Start Example"
            }
        ],
        links: [{ rel: "stylesheet", href: stylesheetUrl }]
    }),
    shellComponent: RootDocument,
    component: RootLayout
});

function RootLayout() {
    return (
        <>
            <AppHeader />
            <main>
                <Outlet />
            </main>
            <AutoLogoutWarningOverlay />
        </>
    );
}

function RootDocument({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body>
                {children}
                <Scripts />
            </body>
        </html>
    );
}
