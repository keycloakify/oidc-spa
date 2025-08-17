import "./App.css";
import { Outlet } from "@tanstack/react-router";
import { Header } from "./Header";
import { AutoLogoutWarningOverlay } from "./AutoLogoutWarningOverlay";

export function Layout() {
    return (
        <>
            <Header />
            <Outlet />
            <AutoLogoutWarningOverlay />
        </>
    );
}
