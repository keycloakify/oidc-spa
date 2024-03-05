import "./App.css";
import { Outlet } from "@tanstack/react-router";
import { Header } from "./Header";
import { AutoLogoutCountdown } from "./AutoLogoutCountdown";

export function Layout() {
    return (
        <>
            <Header />
            <Outlet />
            <AutoLogoutCountdown />
        </>
    );
}
