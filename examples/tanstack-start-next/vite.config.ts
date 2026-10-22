import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    server: {
        port: 3000
    },
    resolve: {
        tsconfigPaths: true
    },
    plugins: [
        tailwindcss(),
        tanstackStart({
            srcDirectory: "src"
        }),
        viteReact(),
        nitro(),
        oidcSpa({
            browserRuntimeFreeze: {
                enabled: true
                //excludes: [ "fetch", "XMLHttpRequest"]
            },
            DPoP: {
                enabled: true,
                mode: "auto"
            }
        })
    ]
});
