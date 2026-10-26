import type { PluginContext } from "rollup";
import type { ResolvedConfig, ViteDevServer, Rollup } from "vite";
import { existsSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { babelParser, babelTraverse, babelTypes, babelGenerate } from "../vendor/build-runtime/babel";
import { resumeReactRouterDocument } from "./reactRouterDocument";

const BOOTSTRAP_ID = "virtual:oidc-spa/react-router-bootstrap";
const RESUME_ID = "virtual:oidc-spa/react-router-resume";
const DOCUMENT_ID = "virtual:oidc-spa/react-router-document";
const SERVER_BUILD_ID = "virtual:react-router/server-build";

type RouterConfig = {
    ssr: boolean | "unstable_api-only";
    basename: string;
};
type RouterContext = {
    reactRouterConfig: RouterConfig;
};
type FrameworkConfig = ResolvedConfig & { __reactRouterPluginContext?: RouterContext };

type DevDocumentModule = {
    handleDocument: (request: Request) => Promise<Response>;
    isApiOnly: boolean;
    basename: string;
    manifestPath: string | undefined;
};

export function createHandleReactRouter(params: {
    resolvedConfig: ResolvedConfig;
    getClientEntrypointSource: (params: { applicationEntrypointImportSpecifier: string }) => string;
}) {
    const { resolvedConfig, getClientEntrypointSource } = params;
    const context = (resolvedConfig as FrameworkConfig).__reactRouterPluginContext;
    if (!context?.reactRouterConfig) {
        throw new Error(
            "oidc-spa: Unsupported React Router Vite plugin: document entry metadata is missing."
        );
    }
    const routerConfig = context.reactRouterConfig;
    if (routerConfig.ssr !== false && routerConfig.ssr !== "unstable_api-only") {
        throw new Error(
            'oidc-spa: React Router Framework requires ssr: false or ssr: "unstable_api-only".'
        );
    }
    const extension = path.extname(fileURLToPath(import.meta.url));
    const documentRuntime = fileURLToPath(new URL(`./reactRouterDocument${extension}`, import.meta.url));
    let bootstrapFile: string | undefined;
    const bootstrapSource = getClientEntrypointSource({
        applicationEntrypointImportSpecifier: RESUME_ID
    });

    function bootstrapUrl(): string {
        if (resolvedConfig.command === "serve") {
            return `${resolvedConfig.base}@id/__x00__${BOOTSTRAP_ID}`;
        }
        if (!bootstrapFile)
            throw new Error(
                "oidc-spa: React Router security bootstrap was not built before the document."
            );
        return `${resolvedConfig.base}${bootstrapFile}`;
    }

    function resolveId(id: string): string | null {
        return [BOOTSTRAP_ID, RESUME_ID, DOCUMENT_ID].includes(id) ? `\0${id}` : null;
    }

    function load(id: string): string | null {
        if (id === `\0${BOOTSTRAP_ID}`) return bootstrapSource;
        if (id === `\0${RESUME_ID}`) return `(${resumeReactRouterDocument.toString()})();`;
        if (id === `\0${DOCUMENT_ID}`) {
            return `
import * as build from ${JSON.stringify(SERVER_BUILD_ID)};
import { createRequestHandler } from "react-router";
export const isApiOnly = build.unstable_apiOnly === true;
export const basename = build.basename;
export const manifestPath = build.routeDiscovery.mode === "lazy"
    ? basename.replace(/\\/$/, "") + "/" + build.routeDiscovery.manifestPath.replace(/^\\//, "")
    : undefined;
const documentBuild = {
    ...build,
    prerender: [],
    // A root splat also serves the fallback for unknown document URLs. Retain all
    // modules because ServerRouter uses the original asset manifest to create routes.
    // Browser route discovery and authenticated .data requests use the original build.
    routes: Object.fromEntries(Object.entries(build.routes).map(([id, route]) => [id, {
        ...route,
        ...(id === "root" ? { path: "*" } : {}),
        module: { ...route.module, loader: undefined, action: undefined, middleware: undefined, headers: undefined }
    }]))
};
export const handleDocument = createRequestHandler(documentBuild, "development");
`;
        }
        return null;
    }

    function buildStart(this: PluginContext) {
        if (resolvedConfig.command !== "build") return;
        if ((this as PluginContext & { environment?: { name: string } }).environment?.name !== "client")
            return;
        this.emitFile({ type: "chunk", id: BOOTSTRAP_ID, name: "oidc-spa-bootstrap" });
    }

    function generateBundle(
        this: PluginContext,
        _options: Rollup.NormalizedOutputOptions,
        bundle: Rollup.OutputBundle
    ) {
        if ((this as PluginContext & { environment?: { name: string } }).environment?.name !== "client")
            return;
        const bootstrap = Object.values(bundle).find(
            (chunk): chunk is Rollup.OutputChunk =>
                chunk.type === "chunk" && chunk.moduleIds.includes(`\0${BOOTSTRAP_ID}`)
        );
        if (!bootstrap) this.error("oidc-spa: Missing React Router security bootstrap.");
        bootstrapFile = bootstrap.fileName;
        assertIsolatedBootstrap(this, bundle, bootstrap);
    }

    function transform(code: string, id: string) {
        if (id.replace(/^\0/, "") !== SERVER_BUILD_ID) return null;
        // API-only's SPA build request must not execute authenticated root loaders either.
        // Keep the original route metadata and normal .data handlers intact.
        const ast = babelParser.parse(code, { sourceType: "module" });
        let found = false;
        let foundEntry = false;
        babelTraverse(ast, {
            VariableDeclarator(p) {
                if (!p.parentPath.parentPath?.isExportNamedDeclaration()) return;
                if (!babelTypes.isIdentifier(p.node.id) || !p.node.init) return;
                if (p.node.id.name === "routes") {
                    found = true;
                    p.node.init = babelTypes.callExpression(
                        babelTypes.identifier("__oidcSpaDocumentRoutes"),
                        [p.node.init]
                    );
                    p.skip();
                } else if (p.node.id.name === "entry") {
                    foundEntry = true;
                    p.node.init = babelTypes.callExpression(
                        babelTypes.identifier("__oidcSpaDocumentEntry"),
                        [p.node.init]
                    );
                    p.skip();
                }
            }
        });
        if (!found || !foundEntry)
            throw new Error(
                "oidc-spa: Unsupported React Router server build: entry/routes exports not found."
            );
        const helper = babelParser.parse(
            `
import { protectReactRouterResponse as __oidcSpaProtectResponse } from ${JSON.stringify(
                documentRuntime
            )};
function __oidcSpaDocumentEntry(entry) {
    return { ...entry, module: { ...entry.module, default: async (...args) =>
        __oidcSpaProtectResponse(await entry.module.default(...args), ${JSON.stringify(bootstrapUrl())})
    }};
}
function __oidcSpaDocumentRoutes(routes) {
    if (typeof unstable_apiOnly === "undefined" || !unstable_apiOnly) return routes;
    const isShellRequest = request => typeof process !== "undefined"
        && process.env.IS_RR_BUILD_REQUEST === "yes"
        && (request.method === "GET" || request.method === "HEAD")
        && !new URL(request.url).pathname.endsWith(".data")
        && request.headers.get("X-React-Router-SPA-Mode") === "yes";
    return Object.fromEntries(Object.entries(routes).map(([id, route]) => [id, {
        ...route,
        module: {
            ...route.module,
            loader: route.module.loader && (args => isShellRequest(args.request) ? undefined : route.module.loader(args)),
            middleware: route.module.middleware?.map(middleware => (args, next) =>
                isShellRequest(args.request) ? next() : middleware(args, next))
        }
    }]));
}`,
            { sourceType: "module" }
        );
        ast.program.body.push(...helper.program.body);
        return babelGenerate(ast, { sourceMaps: true, sourceFileName: id }, code);
    }

    function configureServer(server: ViteDevServer): void {
        server.middlewares.use(async (req, res, next) => {
            if (
                !["GET", "HEAD"].includes(req.method ?? "") ||
                !req.headers.accept?.includes("text/html")
            )
                return next();
            try {
                const url = new URL(
                    req.originalUrl ?? req.url ?? "/",
                    `http://${req.headers.host ?? "localhost"}`
                );
                const pathname = url.pathname;
                const relative = pathname.startsWith(resolvedConfig.base)
                    ? pathname.slice(resolvedConfig.base.length)
                    : pathname;
                const vitePath = relative.replace(/^\//, "");
                if (
                    pathname.endsWith(".data") ||
                    ["@vite/", "@id/", "@fs/", "@react-router/", "node_modules/"].some(prefix =>
                        vitePath.startsWith(prefix)
                    )
                )
                    return next();
                const publicPath = path.resolve(
                    resolvedConfig.publicDir,
                    `.${path.sep}${decodeURIComponent(relative)}`
                );
                if (
                    resolvedConfig.publicDir &&
                    publicPath.startsWith(`${resolvedConfig.publicDir}${path.sep}`) &&
                    existsSync(publicPath) &&
                    statSync(publicPath).isFile()
                )
                    return next();
                const environment = server.environments.ssr;
                if (!environment || !("runner" in environment)) {
                    if (routerConfig.ssr === false) return next();
                    throw new Error(
                        "oidc-spa: React Router document handling requires a runnable Vite SSR environment."
                    );
                }
                const module = await (
                    environment.runner as { import(id: string): Promise<DevDocumentModule> }
                ).import(DOCUMENT_ID);
                // SPA mode already omits non-root server loaders. Retain its public build-time root loader.
                if (!module.isApiOnly || pathname === module.manifestPath) return next();
                const base = module.basename.replace(/\/$/, "");
                if (base && pathname !== base && !pathname.startsWith(`${base}/`)) return next();
                const headers = new Headers();
                for (const [name, value] of Object.entries(req.headers)) {
                    if (value !== undefined)
                        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
                }
                const abort = new AbortController();
                res.once("close", () => {
                    if (!res.writableFinished) abort.abort();
                });
                const response = await module.handleDocument(
                    new Request(url, { method: req.method, headers, signal: abort.signal })
                );
                res.statusCode = response.status;
                response.headers.forEach((value, name) => {
                    if (name !== "set-cookie") res.setHeader(name, value);
                });
                if (response.headers.has("set-cookie"))
                    res.setHeader("set-cookie", response.headers.getSetCookie());
                if (response.body === null || req.method === "HEAD") return res.end();
                Readable.fromWeb(response.body as any)
                    .on("error", error => res.destroy(error))
                    .pipe(res);
            } catch (error) {
                next(error);
            }
        });
    }
    return { resolveId, load, transform, buildStart, generateBundle, configureServer };
}

function assertIsolatedBootstrap(
    context: PluginContext,
    bundle: Rollup.OutputBundle,
    bootstrap: Rollup.OutputChunk
): void {
    const allowed = new Set<string>();
    const pending = [`\0${BOOTSTRAP_ID}`];
    while (pending.length) {
        const id = pending.pop()!;
        if (allowed.has(id)) continue;
        allowed.add(id);
        const info = context.getModuleInfo(id);
        pending.push(...(info?.importedIds ?? []), ...(info?.dynamicallyImportedIds ?? []));
    }
    const visited = new Set<string>();
    const chunks = [bootstrap];
    while (chunks.length) {
        const chunk = chunks.pop()!;
        if (visited.has(chunk.fileName)) continue;
        visited.add(chunk.fileName);
        for (const id of chunk.moduleIds) {
            if (
                !allowed.has(id) &&
                !id.startsWith("\0vite/") &&
                !id.startsWith("\0rolldown/") &&
                !id.startsWith("\0commonjsHelpers") &&
                !id.includes("vite/preload-helper")
            ) {
                context.error(
                    `oidc-spa: Application code leaked into the React Router security bootstrap: ${id}`
                );
            }
        }
        // earlyInit starts a dynamic import of the SDK core even in a callback iframe.
        // None of those chunks may accidentally contain application modules either.
        for (const file of [...chunk.imports, ...chunk.dynamicImports]) {
            const imported = bundle[file];
            if (imported?.type === "chunk") chunks.push(imported);
            else
                context.error(
                    `oidc-spa: Unverified external import in React Router security bootstrap: ${file}`
                );
        }
    }
}
