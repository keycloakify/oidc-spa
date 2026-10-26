import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { OidcInitializationGate } from "~/oidc";
import { router } from "~/router";
import "./index.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <OidcInitializationGate>
            <RouterProvider router={router} />
        </OidcInitializationGate>
    </StrictMode>
);
