import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { OidcInitializationGate } from "~/oidc";
import "./index.css";

const router = getRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <OidcInitializationGate>
            <RouterProvider router={router} />
        </OidcInitializationGate>
    </React.StrictMode>
);
