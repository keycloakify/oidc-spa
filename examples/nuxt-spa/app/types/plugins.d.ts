import type { Oidc } from "oidc-spa/core";
import type { DecodedIdToken } from "~/schemas/oidc";

declare module "#app" {
    interface NuxtApp {
        $oidc: Oidc<DecodedIdToken>;
    }
}

export {};
