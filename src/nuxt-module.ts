import { defineNuxtModule, addVitePlugin } from "@nuxt/kit";
import { oidcSpa, type OidcSpaVitePluginParams } from "./vite-plugin";

export default defineNuxtModule<OidcSpaVitePluginParams>().with({
    meta: {
        name: "oidc-spa",
        configKey: "oidcSpa"
    },
    setup(options, nuxt) {
        if (nuxt.options.ssr !== false) {
            throw new Error(
                "oidc-spa/nuxt-module currently requires SSR to be disabled. " +
                    "Set `ssr: false` in your nuxt.config.ts."
            );
        }

        // Nuxt's development tooling patches these APIs.
        const { browserRuntimeFreeze } = options;
        const options_potentiallyPatched: OidcSpaVitePluginParams =
            nuxt.options.dev && browserRuntimeFreeze
                ? {
                      ...options,
                      browserRuntimeFreeze: {
                          ...browserRuntimeFreeze,
                          excludes: [
                              ...new Set([
                                  ...(browserRuntimeFreeze.excludes ?? []),
                                  "Array",
                                  "Uint8Array",
                                  "Uint32Array"
                              ] as const)
                          ]
                      }
                  }
                : options;

        // Shared Vite builds require global registration so the plugin's config hooks run.
        // Its applyToEnvironment hook selects the client; legacy builds register it there directly.
        addVitePlugin(() => oidcSpa(options_potentiallyPatched), {
            server: nuxt.options.experimental.viteEnvironmentApi === true
        });
    }
});
