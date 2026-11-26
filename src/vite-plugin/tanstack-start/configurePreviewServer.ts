import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { PreviewServer } from "vite";
import { getSpaPaths } from "./spaRouting";

type NitroBuilder = {
    getBuildInfo(root: string): Promise<{
        outputDir?: string;
        buildInfo?: { publicDir?: string; preset?: string };
    }>;
};

type StaticMiddleware = (request: Request, next: () => undefined) => Promise<Response | undefined>;
type NodeAdapter = {
    NodeRequest: new (options: { req: IncomingMessage; res: ServerResponse }) => Request;
    sendNodeResponse(response: ServerResponse, webResponse: Response): Promise<void>;
};

export async function configureTanstackStartPreview(server: PreviewServer): Promise<void> {
    // Nitro is optional. Resolve it from the application, not oidc-spa's installation.
    const projectRequire = createRequire(join(server.config.root, "package.json"));
    let builderPath: string;
    try {
        builderPath = projectRequire.resolve("nitro/builder");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") return;
        throw error;
    }
    const { getBuildInfo } = (await import(pathToFileURL(builderPath).href)) as NitroBuilder;
    const { outputDir, buildInfo } = await getBuildInfo(server.config.root);
    if (outputDir === undefined || buildInfo?.publicDir === undefined) return;

    const publicDir = resolve(outputDir, buildInfo.publicDir);
    const { basePath, callback, shell, backend } = getSpaPaths(server.config.base);
    // No shell during SSR builds or while Start is still prerendering this build.
    if (!existsSync(join(publicDir, shell.slice(1)))) return;

    // Reuse Nitro's static server and Node adapter through their public exports.
    const nitroRequire = createRequire(builderPath);
    const { staticMiddleware } = (await import(
        pathToFileURL(nitroRequire.resolve("srvx/static")).href
    )) as { staticMiddleware(options: { dir: string }): StaticMiddleware };
    const { NodeRequest, sendNodeResponse } = (await import(
        pathToFileURL(nitroRequire.resolve("srvx/node")).href
    )) as NodeAdapter;
    const serveStatic = staticMiddleware({ dir: publicDir });
    const backendRoots = backend.filter(path => !path.endsWith("/*"));
    const cloudflareHome =
        basePath === "/" &&
        buildInfo.preset === "cloudflare-module" &&
        existsSync(join(publicDir, "_prerendered-index.html"));

    server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const request = new NodeRequest({ req, res });
        const url = new URL(request.url);
        if (
            !url.pathname.startsWith(basePath) ||
            backendRoots.some(path => url.pathname === path || url.pathname.startsWith(path + "/"))
        )
            return next();

        async function serveFile(pathname: string) {
            const assetUrl = new URL(url);
            assetUrl.pathname = pathname;
            assetUrl.search = "";
            assetUrl.hash = "";
            return serveStatic(
                new Request(assetUrl, {
                    method: request.method,
                    headers: request.headers,
                    signal: request.signal
                }),
                () => undefined
            );
        }

        void (async () => {
            // Serve the shell directly, keeping the callback URL and its slash in
            // the browser. A filesystem/CDN canonicalization redirect would break it.
            const response =
                url.pathname === callback
                    ? await serveFile(shell)
                    : (await serveFile(
                          cloudflareHome && url.pathname === "/"
                              ? "/_prerendered-index.html"
                              : url.pathname
                      )) ?? (await serveFile(shell));
            if (response === undefined) throw new Error("oidc-spa: The preview SPA shell is missing.");
            await sendNodeResponse(res, response);
        })().catch(next);
    });
}
