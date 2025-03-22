import "./root.css";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Header } from "../components/Header";

export const Route = createRootRoute({
    component: () => (
        <>
            <Header />
            <Outlet />
        </>
    )
});
