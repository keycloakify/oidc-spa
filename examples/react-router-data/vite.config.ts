import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    plugins: [
        tailwindcss(),
        react(),
        // https://docs.oidc-spa.dev/security-features/overview
        oidcSpa({ browserRuntimeFreeze: { enabled: true } })
    ],
    resolve: { tsconfigPaths: true }
});
