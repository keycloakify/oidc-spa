import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vite.dev/config/
export default defineConfig({
    plugins: [svelte()],
    build: {
        sourcemap: true // If you want to use a debugger, add this!
    },
    define: {
        // Tell the router to log when we're in debug mode.
        // Otherwise, this statement is removed by the compiler (known as tree-shaking)
        // and all subsequent log statements are removed at build time:
        "import.meta.env.SPA_ROUTER": {
            logLevel: "debug"
        }
    }
});
