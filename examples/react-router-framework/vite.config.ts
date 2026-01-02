import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    plugins: [
        reactRouter(),
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
