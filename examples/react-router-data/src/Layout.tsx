import { Outlet } from "react-router";
import { Header } from "./components/Header";
import { AutoLogoutWarningOverlay } from "./components/AutoLogoutWarningOverlay";

export function Layout() {
    return (
        <>
            <Header />
            <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 pb-16 pt-28">
                <Outlet />
            </main>
            <AutoLogoutWarningOverlay />
        </>
    );
}
