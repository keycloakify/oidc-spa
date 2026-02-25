// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
    compatibilityDate: "2025-07-15",
    devtools: { enabled: true },
    modules: ["@nuxt/eslint", "@nuxt/ui", "@nuxt/icon", "oidc-spa/nuxt-spa"],
    ssr: false,
    runtimeConfig: {
        public: {
            oidcIssuerUri: "",
            oidcClientId: "",
            oidcUseMock: false
        }
    },
    css: ["./app/assets/css/main.css"],
    vite: {
        // @ts-expect-error Type mismatch between Vite's plugin type and Nuxt's expected plugin type
        plugins: [tailwindcss()]
    },
    oidcSpa: {
        browserRuntimeFreeze: {
            enabled: true
        }
    }
});
