import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    plugins: [
        react(),
        oidcSpa({
            // See https://docs.oidc-spa.dev/v/v8/resources/token-exfiltration-defence
            enableTokenExfiltrationDefense: true
        }),
        tsconfigPaths()
    ]
});
