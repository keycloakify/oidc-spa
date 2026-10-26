// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: "2026-06-30",
    devtools: { enabled: true },
    modules: ["@nuxt/eslint", "@nuxt/ui", "oidc-spa/nuxt-spa"],
    colorMode: {
        preference: "system"
    },
    ssr: false,
    runtimeConfig: {
        public: {
            oidcIssuerUri: "",
            oidcClientId: "",
            oidcUseMock: false
        }
    },
    css: ["~/assets/css/main.css"]
});
