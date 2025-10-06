/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_OIDC_ISSUER_URI: string;
    readonly VITE_OIDC_CLIENT_ID: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
