import { Outlet, createRootRoute } from "@tanstack/react-router";
import { AppHeader } from "~/components/AppHeader";
import "../styles.css";

export const Route = createRootRoute({ component: Root });

function Root() {
    return (
        <>
            <AppHeader />
            <main>
                <Outlet />
            </main>
        </>
    );
}
