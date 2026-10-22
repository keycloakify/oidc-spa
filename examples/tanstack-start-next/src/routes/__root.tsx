/// <reference types="vite/client" />
import { HeadContent, Link, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

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
        ]
    }),
    shellComponent: RootDocument
});

function RootDocument({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body>
                <nav aria-label="Main navigation">
                    <ul>
                        <li>
                            <Link to="/">Home</Link>
                        </li>
                        <li>
                            <Link to="/todo-list">Todo List</Link>
                        </li>
                        <li>
                            <Link to="/todo-list-admin">Todo List Admin</Link>
                        </li>
                    </ul>
                </nav>
                <main>{children}</main>
                <Scripts />
            </body>
        </html>
    );
}
