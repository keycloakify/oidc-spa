import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// NOTE: This plugin is for devlopement purposes (to dynamically link the local version of oidc-spa)
// You don't need this in your project.
import commonjs from "vite-plugin-commonjs";
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), commonjs()]
});
