import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX, REDIRECT_URI_RESERVED_PATH } from "./spaRouting";

// TODO: Update, use REDIRECT_URI_RESERVED_PATH
// maybe we have to keep in mind that the app is not necessarily hosted at the root path
// it can be at https://mycompany.com/dashboard/ please test.

export async function patchVercelOutput(output: { dir: string }) {
    const configPath = join(output.dir, "config.json");
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
                    pre: STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX
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
        route => route instanceof Object && "handle" in route && route.handle === "filesystem"
    );
    if (filesystemIndex === -1) {
        throw new Error("oidc-spa: Expected filesystem routing in Nitro's Vercel output config");
    }

    // A callback must reach the neutral shell before the prerendered home
    // page wins filesystem lookup. Other pages use the shell only after
    // static lookup; APIs and server functions retain Nitro's routing.
    routes.splice(filesystemIndex + 1, 0, spaRoute);
    routes.unshift(callbackRoute);
    config.routes = routes;
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}
