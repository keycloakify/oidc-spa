import { oidcEarlyInit } from "oidc-spa/entrypoint";
import { preventConsoleLoggingOfUnifiedClientRetryForSsrLoadersError } from "oidc-spa/react-tanstack-start/rfcUnifiedClientRetryForSsrLoaders/entrypoint";

const { shouldLoadApp } = oidcEarlyInit({
    freezeFetch: true,
    freezeXMLHttpRequest: true,
    freezeWebSocket: true,
    isPostLoginRedirectManual: true
});

preventConsoleLoggingOfUnifiedClientRetryForSsrLoadersError();

if (shouldLoadApp) {
    import("./client.lazy");
}
