import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { OidcProvider } from "oidc";
import { RouterProvider } from "react-router-dom";
import { router } from "./router/router.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <OidcProvider>
            <RouterProvider router={router} />
        </OidcProvider>
    </React.StrictMode>
);
