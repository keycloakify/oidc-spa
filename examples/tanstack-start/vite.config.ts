import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    server: {
        // oidc-spa: Keep a fixed port for the redirect URI registered with your provider.
        strictPort: true,
        port: 3000,
        // oidc-spa: This hostname is only needed for Auth0.
        host: "app.localhost"
    },
    resolve: {
        tsconfigPaths: true
    },
    plugins: [
        nitro(),
        // For a static prerendered frontend (spa.enabled and prerender.enabled: true),
        // see examples/tanstack-start-prerendered.
        tanstackStart(),
        viteReact(),
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
