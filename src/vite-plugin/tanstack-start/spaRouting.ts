import { buildValidRedirectUri } from "../../core/earlyInit_homeUrlAndValidRedirectUri";

export const BACKEND_PATHS = ["/api", "/api/*", "/_serverFn", "/_serverFn/*"];
export const SPA_DOCUMENT_ATTRIBUTE = "data-oidc-spa-static";
export const HOME_REDIRECT_URI_SPA_ERROR = [
    "oidc-spa: TanStack Start's static SPA routing requires a dedicated redirectUriPath.",
    'Set redirectUriPath to e.g. "/openid-callback/" and register the resulting',
    "URL with your identity provider. The application home remains the default",
    "redirect URI for deployments with per-request server rendering."
].join(" ");

export function getSpaPaths(base = "/", redirectUriPath = "/") {
    const basePath = new URL(base, "http://localhost").pathname.replace(/\/?$/, "/");
    return {
        basePath,
        callback: new URL(
            buildValidRedirectUri({ homeUrl: `http://localhost${basePath}`, redirectUriPath })
        ).pathname,
        shell: basePath + "_shell.html",
        backend: BACKEND_PATHS.map(path => basePath + path.slice(1))
    };
}
