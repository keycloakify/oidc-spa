import { oidcEarlyInit } from "oidc-spa/entrypoint";

const { shouldLoadApp } = oidcEarlyInit();

if (shouldLoadApp) {
    import("./main.lazy");
}
