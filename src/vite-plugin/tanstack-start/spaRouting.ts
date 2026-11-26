import type { REDIRECT_URI_RESERVED_PATH as ReservedPath } from "../../core/validRedirectUri";
import { id } from "../../tools/tsafe/id";

export const REDIRECT_URI_RESERVED_PATH = id<typeof ReservedPath>("/openid-callback/");
export const BACKEND_PATHS = ["/api", "/api/*", "/_serverFn", "/_serverFn/*"];
export const SPA_DOCUMENT_ATTRIBUTE = "data-oidc-spa-static";
export const LEGACY_REDIRECT_URI_SPA_ERROR = [
    "oidc-spa: useLegacyRedirectUri is not supported with TanStack Start in SPA mode.",
    "Remove useLegacyRedirectUri (or set it to false) and update the registered redirect URI",
    "in your IAM administration console to your application URL followed by openid-callback/",
    "(for example, https://myapp.mycompany.com/openid-callback/ or",
    "https://myapp.mycompany.com/dashboard/openid-callback/ if your base path is /dashboard/)."
].join(" ");

export function getSpaPaths(base = "/") {
    const basePath = new URL(base, "http://localhost").pathname.replace(/\/?$/, "/");
    return {
        basePath,
        callback: basePath + REDIRECT_URI_RESERVED_PATH.slice(1),
        shell: basePath + "_shell.html",
        backend: BACKEND_PATHS.map(path => basePath + path.slice(1))
    };
}
