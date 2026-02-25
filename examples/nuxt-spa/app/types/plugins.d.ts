import type { Oidc } from "oidc-spa/core";
import type { DecodedIdToken } from "~/oidc";

declare module "#app" {
    interface NuxtApp {
        $oidc: Oidc<DecodedIdToken>;
    }
}

export {};
