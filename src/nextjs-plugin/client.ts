import { oidcEarlyInit, enableSSRCapability } from "../entrypoint";
import { browserRuntimeFreeze } from "../browser-runtime-freeze";
import { DPoP } from "../DPoP";
import { tokenSubstitution } from "../token-substitution";

// Next.js replaces these expressions at build time, including in dependency modules.
const { shouldLoadApp } = oidcEarlyInit({
    BASE_URL: process.env.OIDC_SPA_NEXTJS_BASE_URL!,
    securityDefenses: {
        ...(process.env.OIDC_SPA_NEXTJS_BROWSER_RUNTIME_FREEZE === "false"
            ? {}
            : browserRuntimeFreeze(JSON.parse(process.env.OIDC_SPA_NEXTJS_BROWSER_RUNTIME_FREEZE!))),
        ...(process.env.OIDC_SPA_NEXTJS_DPOP === "false"
            ? {}
            : DPoP(JSON.parse(process.env.OIDC_SPA_NEXTJS_DPOP!))),
        ...(process.env.OIDC_SPA_NEXTJS_TOKEN_SUBSTITUTION === "false"
            ? {}
            : tokenSubstitution(JSON.parse(process.env.OIDC_SPA_NEXTJS_TOKEN_SUBSTITUTION!)))
    }
});

if (shouldLoadApp) {
    enableSSRCapability();
}
