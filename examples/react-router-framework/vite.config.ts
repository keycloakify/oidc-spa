import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    plugins: [
        tailwindcss(),
        reactRouter(),
        // https://docs.oidc-spa.dev/security-features/overview
        oidcSpa({ browserRuntimeFreeze: { enabled: true } })
    ],
    resolve: { tsconfigPaths: true }
});
