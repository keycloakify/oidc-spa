import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { OidcInitializationGate } from "./oidc";
import { router } from "./router";

createRoot(document.getElementById("app")!).render(
    <StrictMode>
        <OidcInitializationGate>
            <RouterProvider router={router} />
        </OidcInitializationGate>
    </StrictMode>
);
