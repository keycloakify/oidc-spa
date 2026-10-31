import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    server: {
        host: "app.localhost",
        port: 3000,
        strictPort: true,
        proxy: { "/api": "http://127.0.0.1:3001" }
    },
    plugins: [
        tanstackRouter({ target: "react", autoCodeSplitting: true }),
        oidcSpa({
            browserRuntimeFreeze: { enabled: true },
            DPoP: { enabled: true, mode: "auto" }
        }),
        react()
    ],
    resolve: { tsconfigPaths: true },
    build: { outDir: "dist/client" }
});
