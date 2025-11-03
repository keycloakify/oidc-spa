import { Outlet } from "@tanstack/react-router";
import { createRootRoute } from "@tanstack/react-router";
import { AutoLogoutWarningOverlay } from "~/components/AutoLogoutWarningOverlay";
import { Header } from "~/components/Header";
import { OidcInitializationGate } from "~/oidc";
import "../tailwind.css";

export const Route = createRootRoute({
    component: RootComponent
});

function RootComponent() {
    return (
        <OidcInitializationGate>
            <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
                <Header />
                <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 pb-16 pt-28">
                    <Outlet />
                </main>
            </div>
            <AutoLogoutWarningOverlay />
        </OidcInitializationGate>
    );
}
