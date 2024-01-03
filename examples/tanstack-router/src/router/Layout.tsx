import "./App.css";
import { Outlet } from "@tanstack/react-router";
import { Header } from "./Header";

export function Layout() {
    return (
        <>
            <Header />
            <Outlet />
        </>
    );
}
