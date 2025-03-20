import { useOidc, enforceLogin } from "../oidc.client";
import { parseKeycloakIssuerUri } from "oidc-spa/tools/parseKeycloakIssuerUri";
import type { Route } from "./+types/todos";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
    await enforceLogin(request);
}

export function HydrateFallback() {
    return <div>Loading...</div>;
}

export default function Account() {}
