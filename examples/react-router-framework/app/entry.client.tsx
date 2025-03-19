import React from "react";
import ReactDOM from "react-dom/client";
import { handleOidcCallback } from "oidc-spa/handleOidcCallback";

(async () => {
    const { isHandled } = handleOidcCallback();

    if (isHandled) {
        return;
    }

    const { HydratedRouter } = await import("react-router/dom");

    ReactDOM.hydrateRoot(
        document,
        <React.StrictMode>
            <HydratedRouter />
        </React.StrictMode>
    );
})();
