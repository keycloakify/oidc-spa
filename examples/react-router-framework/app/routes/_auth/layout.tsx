import { Outlet } from "react-router";
import type { Route } from "./+types/layout";
import { enforceLogin } from "~/oidc";

export const clientMiddleware: Route.ClientMiddlewareFunction[] = [
    async (args, next) => {
        await enforceLogin(args);
        await next();
    }
];

export default function ProtectedLayout() {
    return <Outlet />;
}
