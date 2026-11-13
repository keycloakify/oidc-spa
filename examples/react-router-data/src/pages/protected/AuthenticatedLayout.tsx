import { Outlet } from "react-router";
import { AutoLogoutWarningOverlay } from "~/components/AutoLogoutWarningOverlay";

export function AuthenticatedLayout() {
    return (
        <>
            <Outlet />
            <AutoLogoutWarningOverlay />
        </>
    );
}
