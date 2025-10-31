import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { OidcInitializationGate } from "~/oidc";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <OidcInitializationGate>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </OidcInitializationGate>
    </React.StrictMode>
);
