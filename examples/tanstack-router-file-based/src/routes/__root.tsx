import "./root.css";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AutoLogoutWarningOverlay } from "../components/AutoLogoutWarningOverlay";
import { Header } from "../components/Header";

export const Route = createRootRoute({
    component: () => (
        <>
            <Header />
            <Outlet />
            <AutoLogoutWarningOverlay />
        </>
    )
});
