import { Outlet } from "react-router";
import { AppHeader } from "./components/AppHeader";

export function Layout() {
    return (
        <>
            <AppHeader />
            <main>
                <Outlet />
            </main>
        </>
    );
}
