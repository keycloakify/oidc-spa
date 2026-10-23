import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    server: {
        port: 3000,
        strictPort: true,
        // Auth0: We use https://app.localhost instead of the default
        // http://localhost to avoid having to grant consent on every reload.
        host: "app.localhost"
    },
    resolve: {
        tsconfigPaths: true
    },
    plugins: [
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
