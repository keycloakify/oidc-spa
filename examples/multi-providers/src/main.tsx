import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { OidcProvider } from "oidc";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <OidcProvider
        //fallback={<h1>Initializing OIDC...</h1>}
        >
            <RouterProvider router={router} />
        </OidcProvider>
    </React.StrictMode>
);
