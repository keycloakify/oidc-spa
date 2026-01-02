import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    plugins: [
        react(),
        // To improve the security of your app see:
        // https://docs.oidc-spa.dev/security-features/overview
        oidcSpa({
            browserRuntimeFreeze: {
                enabled: true
                //exclude: [ "fetch", "XMLHttpRequest"]
            }
        }),
        tsconfigPaths()
    ]
});
