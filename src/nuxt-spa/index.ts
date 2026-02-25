import { defineNuxtModule, addVitePlugin } from "@nuxt/kit";
import { oidcSpa, type OidcSpaVitePluginParams } from "../vite-plugin";

export default defineNuxtModule<OidcSpaVitePluginParams>().with({
    meta: {
        name: "oidc-spa",
        configKey: "oidcSpa", // nuxt.config.ts: { oidcSpa: { ... } }
        compatibility: {
            nuxt: ">=3.0.0"
        }
    },
    setup(resolvedOptions, nuxt) {
        // Check if SSR is disabled
        if (nuxt.options.ssr !== false) {
            throw new Error(
                "oidc-spa module requires SSR to be disabled. Please set `ssr: false` in your nuxt.config.ts"
            );
        }

        // Add vite plugin to only client side
        addVitePlugin(oidcSpa(resolvedOptions || undefined), {
            client: true,
            server: false
        });
    }
});
