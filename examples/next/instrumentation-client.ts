import { oidcEarlyInit } from "oidc-spa/entrypoint";
import { DPoP } from "oidc-spa/DPoP";
import { browserRuntimeFreeze } from "oidc-spa/browser-runtime-freeze";

oidcEarlyInit({
    BASE_URL: process.env.__NEXT_ROUTER_BASEPATH!,
    securityDefenses: {
        // Next.js replaces the push method on its RSC chunk queue.
        ...browserRuntimeFreeze({ excludes: ["Array"] }),
        ...DPoP({ mode: "auto" })
    }
});
