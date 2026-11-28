import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig(({ isPreview }) => ({
    server: {
        // Build-time prerendering uses Vite preview; keep the custom hostname for dev only.
        strictPort: !isPreview,
        port: 3000,
        // oidc-spa: This hostname is only needed for Auth0.
        host: isPreview ? undefined : "app.localhost"
    },
    resolve: {
        tsconfigPaths: true
    },
    plugins: [
        nitro(),
        tanstackStart({
            prerender: { enabled: true },
            spa: {
                enabled: true,
                // Render the shell at a different URL so Start also prerenders the home.
                // https://github.com/TanStack/router/issues/8741
                maskPath: "/?__spa_shell"
            }
        }),
        viteReact(),
        oidcSpa({
            enableRoutingCookie: false,
            redirectUriPath: "/openid-callback/",
            browserRuntimeFreeze: {
                enabled: true
            },
            DPoP: {
                enabled: true,
                mode: "auto"
            }
        })
    ]
}));
