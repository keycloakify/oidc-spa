/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_OIDC_USE_MOCK?: string;
    readonly VITE_OIDC_ISSUER_URI: string;
    readonly VITE_OIDC_CLIENT_ID: string;
    readonly VITE_OIDC_AUDIENCE?: string;
    readonly VITE_OIDC_SSO_SESSION_IDLE_SECONDS?: string;
    readonly VITE_OIDC_CLIENT_SECRET?: string;
    readonly VITE_OIDC_API_URI?: string;
    readonly VITE_OIDC_SCOPE_FOR_API?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
