import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { OidcInitializationGate } from "./oidc";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <OidcInitializationGate>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </OidcInitializationGate>
    </StrictMode>
);
