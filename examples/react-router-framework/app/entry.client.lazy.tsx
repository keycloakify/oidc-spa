import React from "react";
import ReactDOM from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { getOidc, OidcProvider } from "./oidc.client";

getOidc().finally(() =>
    ReactDOM.hydrateRoot(
        document,
        <React.StrictMode>
            {/*
             * NOTE: Do not provide a fallback prop to the <OidcProvider>
             * Use the HydrateFallback of ./root.tsx instead
             */}
            <OidcProvider>
                <HydratedRouter />
            </OidcProvider>
        </React.StrictMode>
    )
);
