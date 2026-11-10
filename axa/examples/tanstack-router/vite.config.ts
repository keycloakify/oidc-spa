import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    server: {
        host: "axa.localhost",
        port: 3002,
        strictPort: true,
        proxy: {
            "/api": {
                target: "http://127.0.0.1:3003",
                // Preserve the browser-facing host for DPoP proof validation.
                changeOrigin: false
            }
        }
    },
    plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react()],
    resolve: { tsconfigPaths: true },
    build: { outDir: "dist/client" }
});
