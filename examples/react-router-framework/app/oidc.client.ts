import { createReactOidc } from "oidc-spa/react";

// Docs: https://www.oidc-spa.dev/
export const { OidcProvider, useOidc, getOidc } = createReactOidc({
    issuerUri: import.meta.env.VITE_OIDC_ISSUER_URI,
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
    homeUrl: import.meta.env.BASE_URL,
    autoLogin: true,
    debugLogs: false
});
