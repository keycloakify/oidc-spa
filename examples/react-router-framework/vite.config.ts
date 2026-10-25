import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig(({ mode }) => {
    // Also make .env available to server loaders/actions through process.env.
    Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

    return {
        server: {
            host: "app.localhost",
            port: 3000,
            strictPort: true
        },
        // These imports are added to the HTML by the oidc-spa plugin.
        optimizeDeps: {
            include: ["oidc-spa/DPoP", "oidc-spa/browser-runtime-freeze"]
        },
        plugins: [
            reactRouter(),
            {
                // RR 8.5 still runs document loaders in API-only development mode.
                // Serve the root shell, as production does, so data loads with a token in the browser.
                name: "api-only-dev-shell",
                configureServer(server) {
                    server.middlewares.use((request, _response, next) => {
                        if (request.method === "GET" && request.headers.accept?.includes("text/html")) {
                            request.url = "/";
                            request.originalUrl = "/";
                        }
                        next();
                    });
                }
            },
            oidcSpa({
                browserRuntimeFreeze: { enabled: true },
                DPoP: { enabled: true, mode: "auto" }
            })
        ],
        resolve: {
            tsconfigPaths: true
        }
    };
});
