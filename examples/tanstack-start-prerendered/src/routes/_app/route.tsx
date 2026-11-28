import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppHeader } from "#/components/AppHeader";
import { AutoLogoutWarningOverlay } from "#/components/AutoLogoutWarningOverlay";

export const Route = createFileRoute("/_app")({
    component: AppLayout
});

function AppLayout() {
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
