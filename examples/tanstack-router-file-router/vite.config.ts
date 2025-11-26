import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    plugins: [
        tanstackRouter(),
        oidcSpa({
            // See https://docs.oidc-spa.dev/v/v8/resources/token-exfiltration-defence
            enableTokenExfiltrationDefense: true
        }),
        tsconfigPaths(),
        react()
    ]
});
