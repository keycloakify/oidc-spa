import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter, type unstable_RouterFetch } from "react-router/dom";
import { getOidc } from "./oidc";

// Authenticate React Router's server loader/action requests.
const authenticatedFetch: unstable_RouterFetch = async (request, context) => {
    if (context.type === "manifest" || new URL(request.url).origin !== window.location.origin) {
        return fetch(request);
    }

    // Router initialization can start before OidcInitializationGate renders.
    const oidc = await getOidc();
    const headers = new Headers(request.headers);
    if (oidc.isUserLoggedIn) {
        headers.set("Authorization", `Bearer ${await oidc.getAccessToken()}`);
    }

    return fetch(new Request(request, { headers }));
};

startTransition(() => {
    hydrateRoot(
        document,
        <StrictMode>
            <HydratedRouter unstable_fetch={authenticatedFetch} />
        </StrictMode>
    );
});
