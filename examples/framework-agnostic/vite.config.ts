import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    server: {
        host: "app.localhost",
        port: 3000,
        strictPort: true,
        proxy: {
            "/api": {
                target: "http://127.0.0.1:3001",
                // Preserve the browser-facing host for DPoP proof validation.
                changeOrigin: false
            }
        }
    },
    plugins: [
        oidcSpa({
            browserRuntimeFreeze: { enabled: true },
            DPoP: { enabled: true, mode: "auto" }
        }),
        vue()
    ],
    build: { outDir: "dist/client" }
});
