import "./App.css";
import { Outlet } from "react-router";
import { Header } from "./Header";

export function Layout() {
    return (
        <>
            <Header />
            <Outlet />
        </>
    );
}
