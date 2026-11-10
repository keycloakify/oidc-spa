import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { OidcProvider, useOidc } from "@axa-fr/react-oidc";
import { oidcConfiguration } from "./oidc";
import { router } from "./router";

// Notify both TanStack's history and AXA's popstate listener after the callback.
const withCustomHistory = () => ({
    replaceState: (url?: string | null) => {
        router.history.replace(url || "/");
        window.dispatchEvent(new PopStateEvent("popstate"));
    }
});

function SessionLost() {
    const { login } = useOidc();
    return (
        <main>
            <h1>Session ended</h1>
            <p>Please sign in again to continue.</p>
            <button onClick={() => login(window.location.pathname + window.location.search)}>
                Sign in again
            </button>
            <p>
                <a href="/">Return home</a>
            </p>
        </main>
    );
}

function AuthenticationError() {
    return (
        <main>
            <h1>Sign-in did not complete</h1>
            <p>Please return home and try again.</p>
            <a href="/">Return home</a>
        </main>
    );
}

createRoot(document.getElementById("app")!).render(
    <StrictMode>
        <OidcProvider
            configuration={oidcConfiguration}
            withCustomHistory={withCustomHistory}
            sessionLostComponent={SessionLost}
            authenticatingErrorComponent={AuthenticationError}
        >
            <RouterProvider router={router} />
        </OidcProvider>
    </StrictMode>
);
