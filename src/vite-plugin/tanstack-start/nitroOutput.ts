import type { Plugin } from "vite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { patchVercelOutput } from "./vercelOutput";
import { patchCloudflareOutput, prepareCloudflarePrerender } from "./cloudflareOutput";
import { patchNetlifyOutput, removeNetlifyCallback } from "./netlifyOutput";

// TODO: This need complete rewrite, we don't want to use a worker anymore we can just use the rooting rules.

export type NitroOutput = { dir: string; publicDir: string; serverDir: string };

// Keep Nitro optional: describe only the module API we use.
type NitroContext = {
    options: { dev: boolean; preset?: string; output: NitroOutput; commands: { preview?: string } };
    hooks: { hook(name: "compiled", callback: () => Promise<void>): void };
};

export function createTanstackStartNitroOutput(params: { isTanstackStart: () => boolean }) {
    let nitro: NitroContext | undefined;
    let assetsDir = "assets";
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
            assetsDir = config.build.assetsDir;
        },
        buildApp: {
            order: "post",
            async handler() {
                await finishCloudflarePrerender?.();
                finishCloudflarePrerender = undefined;
                if (!params.isTanstackStart() || nitro === undefined || nitro.options.dev) return;
                const { preset, output } = nitro.options;
                if (!["vercel", "cloudflare-module", "netlify"].includes(preset ?? "")) return;

                // Start does not expose its resolved SPA config. Inspect the final
                // artifact after prerendering; Nitro clears it on each rebuild.
                if (!existsSync(join(output.publicDir, "_shell.html"))) {
                    // Netlify's edge output lives outside its server output directory.
                    if (preset === "netlify") await removeNetlifyCallback(output);
                    return;
                }
                switch (preset) {
                    case "vercel":
                        await patchVercelOutput(output);
                        break;
                    case "cloudflare-module":
                        await patchCloudflareOutput(output, assetsDir);
                        break;
                    case "netlify":
                        await patchNetlifyOutput(output);
                        break;
                }
            }
        }
    };
    return { nitroModule, plugin };
}
