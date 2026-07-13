import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { AutoLogoutWarningOverlay } from "#/components/AutoLogoutWarningOverlay";
import { Header } from "#/components/Header";
import "../styles.css";

export const Route = createRootRoute({
    component: RootComponent
});

function RootComponent() {
    return (
        <>
            <Header />
            <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 pb-16 pt-28">
                <Outlet />
            </main>
            <AutoLogoutWarningOverlay />
            <TanStackDevtools
                config={{ position: "bottom-right" }}
                plugins={[
                    {
                        name: "TanStack Router",
                        render: <TanStackRouterDevtoolsPanel />
                    }
                ]}
            />
        </>
    );
}
