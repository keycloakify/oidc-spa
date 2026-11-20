export default defineNuxtConfig({
    compatibilityDate: "2026-11-15",
    devtools: { enabled: true },
    ssr: false,
    modules: ["oidc-spa/nuxt-module"],
    oidcSpa: {
        browserRuntimeFreeze: { enabled: true },
        DPoP: { enabled: true, mode: "auto" }
    },
    css: ["~/assets/css/main.css"],
    app: { head: { title: "oidc-spa + Nuxt" } },
    runtimeConfig: {
        keycloakExpectedAccessTokenAudience: "",
        keycloak2ApiClientId: "",
        keycloak2ApiClientSecret: "",
        entraApiClientId: "",
        kvRestApiUrl: "",
        kvRestApiToken: "",
        todosDir: ".",
        public: {
            oidcProvider: "mock",
            keycloakIssuerUri: "",
            keycloakClientId: "",
            keycloak2IssuerUri: "",
            keycloak2ClientId: "",
            auth0IssuerUri: "",
            auth0ClientId: "",
            auth0ApiIdentifier: "",
            auth0SsoSessionIdleSeconds: "",
            entraIssuerUri: "",
            entraClientId: "",
            entraApiScope: ""
        }
    }
});
