import { Outlet } from "react-router";
import { AppHeader } from "./components/AppHeader";
import { AutoLogoutWarningOverlay } from "./components/AutoLogoutWarningOverlay";

export function Layout() {
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
