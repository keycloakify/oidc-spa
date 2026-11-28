import { createFileRoute, Outlet } from "@tanstack/react-router";
import { enforceLogin } from "#/oidc";

export const Route = createFileRoute("/_authenticated")({
    ssr: false,
    beforeLoad: enforceLogin,
    component: () => <Outlet />
});
