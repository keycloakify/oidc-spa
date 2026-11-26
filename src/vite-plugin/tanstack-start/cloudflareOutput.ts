import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NitroOutput } from "./nitroOutput";
import { getSpaPaths } from "./spaRouting";

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

export async function patchCloudflareOutput(output: NitroOutput, base = "/") {
    const { basePath, callback, shell, backend } = getSpaPaths(base);
    const configPath = join(output.serverDir, "wrangler.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (typeof config.main !== "string" || typeof config.assets?.binding !== "string") {
        throw new Error(
            "oidc-spa: Expected a Worker entry and assets binding in Nitro's Wrangler config"
        );
    }

    // The callback is an ordinary static directory index. Query and fragment
    // response modes therefore use exactly the same CDN path.
    const callbackDirectory = join(output.publicDir, callback.slice(1));
    await mkdir(callbackDirectory, { recursive: true });
    await copyFile(join(output.publicDir, shell.slice(1)), join(callbackDirectory, "index.html"));

    // Workers' native SPA fallback always serves /index.html. Preserve the
    // prerendered home separately and rewrite only / to it; other page misses
    // receive the neutral shell directly from the assets service.
    if (basePath === "/") {
        const homePath = join(output.publicDir, "_prerendered-index.html");
        const indexPath = join(output.publicDir, "index.html");
        if (!existsSync(homePath) && existsSync(indexPath)) await copyFile(indexPath, homePath);
        if (existsSync(homePath)) {
            const redirectsPath = join(output.publicDir, "_redirects");
            const redirects = existsSync(redirectsPath) ? await readFile(redirectsPath, "utf8") : "";
            const rule = "/ /_prerendered-index.html 200";
            if (!redirects.split("\n").includes(rule)) {
                await writeFile(redirectsPath, redirects.trimEnd() + "\n" + rule + "\n");
            }
        }
    }
    await copyFile(join(output.publicDir, shell.slice(1)), join(output.publicDir, "index.html"));
    config.assets.not_found_handling = "single-page-application";
    if (config.assets.run_worker_first !== true) {
        config.assets.run_worker_first = Array.from(
            new Set([...(config.assets.run_worker_first || []), ...backend])
        );
    }
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}
