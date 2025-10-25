import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import Header from "@/components/Header";
import { AutoLogoutWarningOverlay } from "@/components/AutoLogoutWarningOverlay";

import appCss from "../styles.css?url";

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
                title: "TanStack Start Starter"
            }
        ],
        links: [
            {
                rel: "stylesheet",
                href: appCss
            }
        ]
    }),
    shellComponent: RootDocument
});

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body
                className="min-h-screen text-white"
                style={{
                    backgroundColor: "#0f172a",
                    backgroundImage: "linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)"
                }}
            >
                <div className="min-h-screen flex flex-col">
                    <Header />
                    <main className="flex flex-1 flex-col">
                        <div className="flex flex-1 flex-col">{children}</div>
                    </main>
                </div>
                <AutoLogoutWarningOverlay />
                <TanStackDevtools
                    config={{
                        position: "bottom-right"
                    }}
                    plugins={[
                        {
                            name: "Tanstack Router",
                            render: <TanStackRouterDevtoolsPanel />
                        }
                    ]}
                />
                <Scripts />
            </body>
        </html>
    );
}
