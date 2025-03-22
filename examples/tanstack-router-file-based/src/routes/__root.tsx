import "./root.css";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AutoLogoutCountdown } from "../components/AutoLogoutCountdown";
import { Header } from "../components/Header";

export const Route = createRootRoute({
    component: () => (
        <>
            <Header />
            <Outlet />
            <AutoLogoutCountdown />
        </>
    )
});
