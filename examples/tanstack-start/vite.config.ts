import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig(({ command, isPreview }) => ({
    // Preview also uses command: "serve". Only the dev server needs this hostname.
    server: {
        // oidc-spa: It's better to have a fixed port to register the valid redirect uri for dev
        strictPort: !isPreview,
        port: 3000,
        // oidc-spa: This is only for Auth0.
        host: isPreview ? undefined : "app.localhost"
    },
    resolve: {
        tsconfigPaths: true
    },
    plugins: [
        tanstackStart({
            prerender: { enabled: true },
            spa: {
                enabled: command === "build",
                // Keep the home and shell renders distinct until this is fixed:
                // https://github.com/TanStack/router/issues/8741
                // This is a bug unrelated to the oidc-spa context.
                maskPath: "/?__spa_shell"
            }
        }),
        viteReact(),
        nitro({
            // Keep the self-hosted output alongside the three cloud builds.
            output:
                process.env.NITRO_PRESET === "node-server" ? { dir: "self-hosted/.output" } : undefined
        }),
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
}));
