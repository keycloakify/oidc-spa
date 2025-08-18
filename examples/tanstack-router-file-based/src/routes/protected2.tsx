import { createFileRoute } from "@tanstack/react-router";
import { enforceLogin } from "../oidc";

export const Route = createFileRoute("/protected2")({
    beforeLoad: enforceLogin
});
