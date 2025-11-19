import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    plugins: [
        react(),
        oidcSpa({
            freezeFetch: true,
            freezeXMLHttpRequest: true,
            freezeWebSocket: true
        }),
        tsconfigPaths()
    ]
});
