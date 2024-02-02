import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// This enables absolute imports like `import { useOidc } from "oidc";`
// instead of `import { useOidc } from "../../oidc";`
import tsconfigPaths from "vite-tsconfig-paths";
// NOTE: This plugin is for devlopement purposes (to dynamically link the local version of oidc-spa)
// You don't need this in your project.
import commonjs from "vite-plugin-commonjs";
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), tsconfigPaths(), commonjs()],
    resolve: {
        preserveSymlinks: true
    }
});
