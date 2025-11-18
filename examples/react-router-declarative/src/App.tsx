import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AutoLogoutWarningOverlay } from "./components/AutoLogoutWarningOverlay";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";
import { useOidc } from "~/oidc";

const Protected = lazy(() => import("./pages/Protected"));
const AdminOnly = lazy(() => import("./pages/AdminOnly"));

export function App() {
    const { isOidcReady } = useOidc();

    if (!isOidcReady) {
        return null;
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
            <Header />
            <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 pb-16 pt-28">
                <Routes>
                    <Route index element={<Home />} />
                    <Route path="protected" element={<Protected />} />
                    <Route path="admin-only" element={<AdminOnly />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
            <AutoLogoutWarningOverlay />
        </div>
    );
}
