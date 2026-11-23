import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NitroOutput } from "./nitroOutput";
import { BACKEND_PATHS, stateQueryParamValuePrefix } from "./spaRouting";

export function prepareCloudflarePrerender(options: {
    output: NitroOutput;
    commands: { preview?: string };
}) {
    // Start sets TSS_PRERENDERING on the Node process, but Wrangler's isolated
    // Worker does not inherit process.env. Supply it only for local prerendering.
    // https://github.com/TanStack/router/issues/7740
    const original = options.commands.preview;
    if (original === undefined) return;
    options.commands.preview = original + " --var TSS_PRERENDERING:true";
    return async () => {
        options.commands.preview = original;
        const path = join(options.output.dir, "nitro.json");
        if (!existsSync(path)) return;
        const info = JSON.parse(await readFile(path, "utf8"));
        info.commands.preview = original;
        await writeFile(path, JSON.stringify(info, null, 2) + "\n");
    };
}

export async function patchCloudflareOutput(output: NitroOutput, assetsDir: string) {
    const configPath = join(output.serverDir, "wrangler.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (typeof config.main !== "string" || typeof config.assets?.binding !== "string") {
        throw new Error(
            "oidc-spa: Expected a Worker entry and assets binding in Nitro's Wrangler config"
        );
    }
    const filename = "oidc-spa-worker.mjs";
    if (config.main === filename) return;
    const entry = JSON.stringify(config.main.startsWith(".") ? config.main : `./${config.main}`);
    // Workers assets cannot match query strings. Run a small dispatcher on the
    // home page and on misses; it serves files through ASSETS without invoking SSR.
    const source = `
import server from ${entry};
export * from ${entry};
export default {
    ...server,
    async fetch(request, env, context) {
        const url = new URL(request.url);
        if (/^\\/(?:api|_serverFn)(?:\\/|$)/.test(url.pathname)) {
            return server.fetch(request, env, context);
        }
        const assets = env[${JSON.stringify(config.assets.binding)}];
        const callback = url.pathname === "/" &&
            (request.method === "GET" || request.method === "HEAD") &&
            url.searchParams.get("state")?.startsWith(${JSON.stringify(stateQueryParamValuePrefix)});
        if (!callback) {
            const response = await assets.fetch(request);
            if (response.status !== 404 || url.pathname.startsWith(${JSON.stringify(
                `/${assetsDir}/`
            )})) return response;
        }
        // Follow the assets service's HTML canonicalization internally, keeping
        // the original callback URL (and code/state) in the browser untouched.
        let shell = new URL("/_shell.html", url);
        for (let i = 0; i < 3; i++) {
            const response = await assets.fetch(new Request(shell, {
                method: request.method === "HEAD" ? "HEAD" : "GET"
            }));
            const location = response.headers.get("location");
            if (response.status < 300 || response.status >= 400 || !location) return response;
            shell = new URL(location, shell);
        }
        throw new Error("oidc-spa: Could not resolve the static SPA shell");
    }
};
`;
    await writeFile(join(output.serverDir, filename), source.trimStart());
    config.main = filename;
    config.assets.not_found_handling = "none";
    if (config.assets.run_worker_first !== true) {
        config.assets.run_worker_first = Array.from(
            new Set([...(config.assets.run_worker_first || []), "/", ...BACKEND_PATHS])
        );
    }
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}
