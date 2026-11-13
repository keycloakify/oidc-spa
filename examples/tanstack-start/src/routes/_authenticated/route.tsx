import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AutoLogoutWarningOverlay } from "~/components/AutoLogoutWarningOverlay";
import { enforceLogin } from "~/oidc";

export const Route = createFileRoute("/_authenticated")({
    beforeLoad: enforceLogin,
    component: AuthenticatedLayout
});

function AuthenticatedLayout() {
    return (
        <>
            <Outlet />
            <AutoLogoutWarningOverlay />
        </>
    );
}
