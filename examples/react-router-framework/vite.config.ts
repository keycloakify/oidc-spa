import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    plugins: [
        reactRouter(),
        oidcSpa({
            // For security reason it's highly recommended to
            // freeze the API that caries tokens.
            freezeFetch: true,
            freezeXMLHttpRequest: true,
            freezeWebSocket: true
        }),
        tsconfigPaths()
    ]
});
