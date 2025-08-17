import "./App.css";
import { Outlet } from "react-router";
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
