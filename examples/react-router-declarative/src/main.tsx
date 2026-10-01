import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { OidcInitializationGate } from "~/oidc";
import "./index.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <OidcInitializationGate>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </OidcInitializationGate>
    </StrictMode>
);
