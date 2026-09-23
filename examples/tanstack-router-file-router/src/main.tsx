import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { OidcInitializationGate } from "#/oidc";

const router = getRouter();
const rootElement = document.getElementById("app")!;

if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <OidcInitializationGate>
            <RouterProvider router={router} />
        </OidcInitializationGate>
    );
}
