import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AutoLogoutWarningOverlay } from "./components/AutoLogoutWarningOverlay";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";

const Protected = lazy(() => import("./pages/Protected"));
const AdminOnly = lazy(() => import("./pages/AdminOnly"));

export function App() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
            <Header />
            <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 pb-16 pt-28">
                <Suspense fallback={<RouteSpinner />}>
                    <Routes>
                        <Route index element={<Home />} />
                        <Route path="protected" element={<Protected />} />
                        <Route path="admin-only" element={<AdminOnly />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Suspense>
            </main>
            <AutoLogoutWarningOverlay />
        </div>
    );
}

function RouteSpinner() {
    return (
        <div className="flex items-center justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-white" />
        </div>
    );
}
