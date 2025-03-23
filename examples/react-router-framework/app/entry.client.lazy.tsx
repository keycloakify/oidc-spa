import React from "react";
import ReactDOM from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { OidcProvider } from "./oidc.client";

ReactDOM.hydrateRoot(
    document,
    <React.StrictMode>
        <OidcProvider>
            <HydratedRouter />
        </OidcProvider>
    </React.StrictMode>
);
