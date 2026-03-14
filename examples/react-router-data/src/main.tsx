import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { OidcInitializationGate } from "~/oidc";
import { router } from "~/router";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <OidcInitializationGate>
            <RouterProvider router={router} />
        </OidcInitializationGate>
    </React.StrictMode>
);
