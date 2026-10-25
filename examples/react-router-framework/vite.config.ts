import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    server: {
        host: "app.localhost",
        port: 3000,
        strictPort: true,
        proxy: {
            "/api": { target: "http://127.0.0.1:3001", xfwd: true }
        }
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
