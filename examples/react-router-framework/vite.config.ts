import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    plugins: [
        reactRouter(),
        oidcSpa({
            safeMode: true
        }),
        tsconfigPaths()
    ]
});
