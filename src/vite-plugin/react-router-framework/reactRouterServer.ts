import type * as ReactRouter from "react-router" assert { "resolution-mode": "import" };
import type { RouteObject, ServerBuild } from "react-router" assert { "resolution-mode": "import" };
// React Router exposes types through package exports, which the SDK's legacy
// node module resolution cannot see. Resolve its types explicitly above.
// @ts-expect-error Runtime import is valid; its declarations use modern resolution.
import * as reactRouter from "react-router";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSpaPaths } from "../tanstack-start/spaRouting";

const { createRequestHandler, matchRoutes } = reactRouter as typeof ReactRouter;

/** Keep API-only data handling and enable native resource routes without rendering UI documents. */
export function createReactRouterRequestHandler(build: ServerBuild, mode = "production") {
    const handleRequest = createRequestHandler(build, mode);
    // RR 8.5's API-only handler rejects plain resource URLs before route matching.
    // Use the normal server handler ONLY for matched resource modules. This retains
    // RR's method handling, middleware, error responses, streaming and instrumentation.
    const handleResource = build.unstable_apiOnly
        ? createRequestHandler({ ...build, ssr: true, unstable_apiOnly: false }, mode)
        : handleRequest;

    function routes(parentId?: string): RouteObject[] {
        return Object.values(build.routes)
            .filter(route => route !== undefined && route.parentId === parentId)
            .map(route => {
                const common = { id: route!.id, path: route!.path, caseSensitive: route!.caseSensitive };
                return route!.index
                    ? { ...common, index: true }
                    : { ...common, children: routes(route!.id) };
            });
    }
    const routeTree = routes();

    function matchedRoute(url: URL) {
        const matches = matchRoutes(routeTree, url.pathname, build.basename);
        const id = matches?.[matches.length - 1]?.route.id;
        return id === undefined ? undefined : build.routes[id];
    }

    function isDocumentRoute(route: ReturnType<typeof matchedRoute>) {
        const manifest = route && build.assets.routes[route.id];
        // API-only production builds strip React exports from server modules.
        // The asset manifest retains whether the original route has a UI.
        return (
            (manifest && "hasDefaultExport" in manifest && manifest.hasDefaultExport === true) ||
            manifest?.hasErrorBoundary === true ||
            route?.module.default != null ||
            route?.module.ErrorBoundary != null
        );
    }

    function isResourceRequest(url: URL): boolean {
        if (!build.ssr || url.pathname.endsWith(".data")) return false;
        if (build.routeDiscovery.mode === "lazy") {
            const manifestPath = `${(build.basename ?? "/").replace(
                /\/$/,
                ""
            )}/${build.routeDiscovery.manifestPath.replace(/^\//, "")}`;
            if (url.pathname === manifestPath) return false;
        }
        const route = matchedRoute(url);
        if (isDocumentRoute(route)) return false;
        const module = route?.module;
        return (
            module !== undefined &&
            module.default == null &&
            module.ErrorBoundary == null &&
            (module.loader !== undefined || module.action !== undefined)
        );
    }

    return Object.assign(
        (request: Request, context?: Parameters<typeof handleRequest>[1]) =>
            (isResourceRequest(new URL(request.url)) ? handleResource : handleRequest)(request, context),
        {
            isResourceRequest,
            isDocumentRequest(url: URL) {
                return isDocumentRoute(matchedRoute(url));
            }
        }
    );
}

// react-router-serve accepts a server build's fetch export before applying its
// API-only dispatch. The plugin generates that export, so applications keep the
// built-in HTTP/static-file server. Initialize lazily, after all build exports exist.
export function createReactRouterFetchHandler(getBuild: () => ServerBuild) {
    let runtime: ReturnType<typeof createRuntime> | undefined;
    return (request: Request): Promise<Response> => (runtime ??= createRuntime(getBuild()))(request);
}

function createRuntime(build: ServerBuild) {
    const handleRequest = createReactRouterRequestHandler(build);
    const { basePath, callback } = getSpaPaths(build.basename);
    const manifestPath =
        build.routeDiscovery.mode === "lazy"
            ? basePath + build.routeDiscovery.manifestPath.replace(/^\//, "")
            : undefined;
    const assetsPath = new URL("assets/", new URL(build.publicPath, "http://localhost")).pathname;
    let document: Promise<string> | undefined;

    function readDocument() {
        return (document ??= readFile(resolve(build.assetsBuildDirectory, "__spa-fallback.html"), "utf8")
            .catch(error => {
                if (error.code !== "ENOENT") throw error;
                return readFile(resolve(build.assetsBuildDirectory, "index.html"), "utf8");
            })
            .catch(error => {
                document = undefined;
                throw error;
            }));
    }

    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        if (
            url.pathname.endsWith(".data") ||
            url.pathname === manifestPath ||
            handleRequest.isResourceRequest(url)
        ) {
            return handleRequest(request);
        }
        const isWithinBase = url.pathname === basePath.slice(0, -1) || url.pathname.startsWith(basePath);
        const isAsset = url.pathname === assetsPath.slice(0, -1) || url.pathname.startsWith(assetsPath);
        const isDocument =
            handleRequest.isDocumentRequest(url) ||
            url.pathname === callback ||
            request.headers.get("Accept")?.includes("text/html");
        if (!isWithinBase || isAsset || !isDocument) return handleRequest(request);
        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
        }
        const html = await readDocument();
        return new Response(request.method === "HEAD" ? null : html, {
            headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }
        });
    };
}
