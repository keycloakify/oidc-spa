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
        oidcSpa({}),
        tanstackStart(),
        viteReact()
    ]
});

export default config;
