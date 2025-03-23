import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
// NOTE: This plugin is for devolvement purposes (to dynamically link the local version of oidc-spa)
// You don't need this in your project.
import commonjs from "vite-plugin-commonjs";

export default defineConfig({
    plugins: [reactRouter(), tsconfigPaths(), commonjs()]
});
