import { oidcEarlyInit } from "../entrypoint";
import { browserRuntimeFreeze } from "../browser-runtime-freeze";
import { DPoP } from "../DPoP";
import { tokenSubstitution } from "../token-substitution";

// Next.js replaces these expressions at build time, including in dependency modules.
oidcEarlyInit({
    BASE_URL: process.env.OIDC_SPA_NEXTJS_BASE_URL!,
    securityDefenses: {
        ...(process.env.OIDC_SPA_NEXTJS_BROWSER_RUNTIME_FREEZE === "false"
            ? undefined
            : browserRuntimeFreeze(JSON.parse(process.env.OIDC_SPA_NEXTJS_BROWSER_RUNTIME_FREEZE!))),
        ...(process.env.OIDC_SPA_NEXTJS_DPOP === "false"
            ? undefined
            : DPoP(JSON.parse(process.env.OIDC_SPA_NEXTJS_DPOP!))),
        ...(process.env.OIDC_SPA_NEXTJS_TOKEN_SUBSTITUTION === "false"
            ? undefined
            : tokenSubstitution(JSON.parse(process.env.OIDC_SPA_NEXTJS_TOKEN_SUBSTITUTION!)))
    },
    enableRoutingCookie: true
});
