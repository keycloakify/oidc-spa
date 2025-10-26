import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    plugins: [reactRouter(), oidcSpa(), tsconfigPaths()],
    optimizeDeps: {
        include: ["oidc-spa/react-spa", "oidc-spa/entrypoint", "oidc-spa/keycloak", "zod"]
    }
});
