import type { Plugin } from "vite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { patchVercelOutput } from "./vercelOutput";
import { patchCloudflareOutput, prepareCloudflarePrerender } from "./cloudflareOutput";
import { patchNetlifyOutput, removeNetlifyCallback } from "./netlifyOutput";

import { getSpaPaths, HOME_REDIRECT_URI_SPA_ERROR } from "./spaRouting";
import { prepareSpaOutput } from "./prepareSpaOutput";

export type NitroOutput = { dir: string; publicDir: string; serverDir: string };

// Keep Nitro optional: describe only the module API we use.
type NitroContext = {
    options: { dev: boolean; preset?: string; output: NitroOutput; commands: { preview?: string } };
    hooks: { hook(name: "compiled", callback: () => Promise<void>): void };
};

export function createTanstackStartNitroOutput(params: {
    isTanstackStart: () => boolean;
    redirectUriPath?: string;
}) {
    let nitro: NitroContext | undefined;
    let base = "/";
    let finishCloudflarePrerender: (() => Promise<void>) | undefined;
    const nitroModule = {
        name: "oidc-spa:tanstack-start-output",
        setup(context: NitroContext) {
            nitro = context;
            context.hooks.hook("compiled", async () => {
                if (
                    params.isTanstackStart() &&
                    !context.options.dev &&
                    context.options.preset === "cloudflare-module"
                ) {
                    finishCloudflarePrerender = prepareCloudflarePrerender(context.options);
                }
            });
        }
    };
    const plugin: Plugin = {
        name: "oidc-spa:tanstack-start-output",
        enforce: "post",
        apply: "build",
        configResolved(config) {
            base = config.base;
        },
        buildApp: {
            order: "post",
            async handler() {
                await finishCloudflarePrerender?.();
                finishCloudflarePrerender = undefined;
                if (!params.isTanstackStart() || nitro === undefined || nitro.options.dev) return;
                const { preset, output } = nitro.options;
                if (!["vercel", "cloudflare-module", "netlify", "node-server"].includes(preset ?? ""))
                    return;

                const { basePath, callback, shell } = getSpaPaths(base, params.redirectUriPath ?? "/");
                const unmounted = existsSync(join(output.publicDir, "_shell.html"));
                // Start does not expose its resolved SPA config. Inspect the final
                // artifact after prerendering; Nitro clears it on each rebuild.
                if (!unmounted && !existsSync(join(output.publicDir, shell.slice(1)))) {
                    // Netlify's edge output lives outside its server output directory.
                    if (preset === "netlify") await removeNetlifyCallback(output);
                    return;
                }
                if (callback === basePath) throw new Error(HOME_REDIRECT_URI_SPA_ERROR);
                if (unmounted) await prepareSpaOutput(output.publicDir, basePath);
                switch (preset) {
                    case "vercel":
                        await patchVercelOutput(output, base, params.redirectUriPath ?? "/");
                        break;
                    case "cloudflare-module":
                        await patchCloudflareOutput(output, base, params.redirectUriPath ?? "/");
                        break;
                    case "netlify":
                        await patchNetlifyOutput(output, base, params.redirectUriPath ?? "/");
                        break;
                }
            }
        }
    };
    return { nitroModule, plugin };
}
