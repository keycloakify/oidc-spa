import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter, type unstable_RouterFetch as RouterFetch } from "react-router/dom";
import { getOidc } from "./oidc";

// Authenticate React Router's server loader/action requests.
const fetchWithAuth: RouterFetch = async (input, context) => {
    if (context.type === "manifest") {
        return fetch(input);
    }

    const request = new Request(input);
    const oidc = await getOidc();
    if (oidc.isUserLoggedIn) {
        request.headers.set("Authorization", `Bearer ${await oidc.getAccessToken()}`);
    }

    return fetch(request);
};

startTransition(() => {
    hydrateRoot(
        document,
        <StrictMode>
            <HydratedRouter unstable_fetch={fetchWithAuth} />
        </StrictMode>
    );
});
