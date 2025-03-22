import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { OidcProvider } from "./oidc";
import { RouterProvider } from "react-router";
import { router } from "./router/router";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <OidcProvider
        //fallback={<h1>Initializing OIDC...</h1>}
        >
            <RouterProvider router={router} />
        </OidcProvider>
    </React.StrictMode>
);
