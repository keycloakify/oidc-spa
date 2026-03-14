import { Outlet } from "@tanstack/react-router";
import { createRootRoute } from "@tanstack/react-router";
import { AutoLogoutWarningOverlay } from "~/components/AutoLogoutWarningOverlay";
import { Header } from "~/components/Header";

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
        </>
    );
}
