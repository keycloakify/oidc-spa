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
                    backgroundColor: "#000000",
                    backgroundImage:
                        "radial-gradient(ellipse 60% 60% at 0% 100%, #444444 0%, #222222 60%, #000000 100%)"
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
