import { oidcEarlyInit } from "oidc-spa/entrypoint";

const { shouldLoadApp } = oidcEarlyInit({
    freezeFetch: true,
    freezeXMLHttpRequest: true,
    freezeWebSocket: true,
    isPostLoginRedirectManual: true
});

if (shouldLoadApp) {
    import("./client.lazy");
}
