import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { oidcSpa } from "oidc-spa/vite-plugin";

export default defineConfig({
    plugins: [tanstackRouter(), oidcSpa(), tsconfigPaths(), react()]
});
