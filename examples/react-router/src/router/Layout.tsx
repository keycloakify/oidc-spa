import "./App.css";
import { Outlet } from "react-router";
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
