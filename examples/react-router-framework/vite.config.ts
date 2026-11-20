import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    server: {
        host: "app.localhost",
        port: 3000,
        strictPort: true
    },
    plugins: [
        reactRouter(),
        oidcSpa({
            browserRuntimeFreeze: { enabled: true },
            DPoP: { enabled: true, mode: "auto" }
        })
    ],
    resolve: {
        tsconfigPaths: true
    }
});
