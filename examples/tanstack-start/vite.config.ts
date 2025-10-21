import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitroV2Plugin } from "@tanstack/nitro-v2-vite-plugin";
import { oidcSpa } from "oidc-spa/vite-plugin";

const config = defineConfig({
    plugins: [
        nitroV2Plugin(),
        // this is the plugin that enables path aliases
        viteTsConfigPaths({
            projects: ["./tsconfig.json"]
        }),
        tailwindcss(),
        tanstackStart(),
        oidcSpa({
            freezeFetch: true,
            freezeWebSocket: true,
            freezeXMLHttpRequest: true
        }),
        viteReact()
    ],
    optimizeDeps: {
        exclude: [
            "oidc-spa/entrypoint",
            "oidc-spa/react-tanstack-start",
            "oidc-spa/react-tanstack-start/rfcUnifiedClientRetryForSsrLoaders",
            "oidc-spa/react-tanstack-start/rfcUnifiedClientRetryForSsrLoaders/entrypoint"
        ]
    }
});

export default config;
