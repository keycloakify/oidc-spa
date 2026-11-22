import type { Plugin } from "vite";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX } from "../../core/StateData";
import { id } from "../../tools/tsafe/id";

// Keep Nitro optional: only describe the module API we use, without importing its runtime.
type NitroContext = {
    options: {
        dev: boolean;
        preset?: string;
        output: { dir: string; publicDir: string };
    };
};

export function createTanstackStartVercelOutput(params: { isTanstackStart: () => boolean }) {
    let nitro: NitroContext | undefined;

    const nitroModule = {
        name: "oidc-spa:tanstack-start-vercel",
        setup(context: NitroContext) {
            nitro = context;
        }
    };

    const plugin: Plugin = {
        name: "oidc-spa:tanstack-start-vercel-output",
        enforce: "post",
        apply: "build",
        buildApp: {
            order: "post",
            async handler() {
                if (
                    !params.isTanstackStart() ||
                    nitro === undefined ||
                    nitro.options.dev ||
                    nitro.options.preset !== "vercel"
                ) {
                    return;
                }

                // Start does not expose its resolved SPA config to other plugins.
                // Detect its final shell artifact after prerendering instead: Nitro
                // clears this output before each build, so an older SPA build cannot
                // enable these rules for a subsequent SSR build.
                if (!existsSync(join(nitro.options.output.publicDir, "_shell.html"))) {
                    return;
                }

                const configPath = join(nitro.options.output.dir, "config.json");
                const config = JSON.parse(await readFile(configPath, "utf8")) as {
                    routes?: unknown[];
                };
                if (!Array.isArray(config.routes)) {
                    throw new Error("oidc-spa: Expected routes in Nitro's Vercel output config");
                }

                const callbackRoute = {
                    src: "^/$",
                    has: [
                        {
                            type: "query",
                            key: "state",
                            value: {
                                pre: id<STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX>("b2lkYy1zcGEu")
                            }
                        }
                    ],
                    methods: ["GET", "HEAD"],
                    dest: "/_shell.html"
                };

                const spaRoute = {
                    src: "^/(?!api(?:/|$)|_serverFn(?:/|$)).*$",
                    dest: "/_shell.html"
                };

                // Reinsert our rules at their required phases, without duplicating
                // them if this hook runs again for the same output.
                const ownRoutes = [callbackRoute, spaRoute].map(route => JSON.stringify(route));
                const routes = config.routes.filter(route => !ownRoutes.includes(JSON.stringify(route)));
                const filesystemIndex = routes.findIndex(
                    route =>
                        route instanceof Object && "handle" in route && route.handle === "filesystem"
                );
                if (filesystemIndex === -1) {
                    throw new Error(
                        "oidc-spa: Expected filesystem routing in Nitro's Vercel output config"
                    );
                }

                // A callback must reach the neutral shell before the prerendered home
                // page wins filesystem lookup. Other pages use the shell only after
                // static lookup; APIs and server functions retain Nitro's routing.
                routes.splice(filesystemIndex + 1, 0, spaRoute);
                routes.unshift(callbackRoute);
                config.routes = routes;
                await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
            }
        }
    };

    return { nitroModule, plugin };
}
