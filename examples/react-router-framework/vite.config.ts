import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [reactRouter(), tsconfigPaths()],
    optimizeDeps: {
        include: [
            "oidc-spa/react",
            "oidc-spa/entrypoint",
            "oidc-spa/keycloak",
            "oidc-spa/tools/decodeJwt",
            "zod"
        ]
    }
});
