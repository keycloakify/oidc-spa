import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getSpaPaths } from "./spaRouting";

export async function patchVercelOutput(output: { dir: string }, base = "/", redirectUriPath = "/") {
    const { basePath, callback, shell } = getSpaPaths(base, redirectUriPath);
    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const configPath = join(output.dir, "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
        routes?: unknown[];
    };
    if (!Array.isArray(config.routes)) {
        throw new Error("oidc-spa: Expected routes in Nitro's Vercel output config");
    }

    const callbackRoute = {
        src: `^${escapeRegExp(callback)}$`,
        methods: ["GET", "HEAD"],
        dest: shell
    };

    const spaRoute = {
        src: `^${escapeRegExp(basePath)}(?!api(?:/|$)|_serverFn(?:/|$)).*$`,
        dest: shell
    };

    // Reinsert our rules at their required phases, without duplicating
    // them if this hook runs again for the same output.
    const ownRoutes = [callbackRoute, spaRoute].map(route => JSON.stringify(route));
    const routes = config.routes.filter(route => !ownRoutes.includes(JSON.stringify(route)));
    const filesystemIndex = routes.findIndex(
        route => route instanceof Object && "handle" in route && route.handle === "filesystem"
    );
    if (filesystemIndex === -1) {
        throw new Error("oidc-spa: Expected filesystem routing in Nitro's Vercel output config");
    }

    // Reserve the callback path for the neutral shell. Other pages use it after
    // static lookup; APIs and server functions retain Nitro's routing.
    routes.splice(filesystemIndex + 1, 0, spaRoute);
    routes.unshift(callbackRoute);
    config.routes = routes;
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}
