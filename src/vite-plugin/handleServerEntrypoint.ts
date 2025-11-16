import type { ResolvedConfig } from "vite";
import type { PluginContext } from "rollup";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { assert } from "../tools/tsafe/assert";
import type { Equals } from "../tools/tsafe/Equals";
import type { ProjectType } from "./projectType";
import {
    resolveCandidate,
    resolvePackageFile,
    normalizeAbsolute,
    splitId,
    normalizeRequestPath
} from "./utils";

type EntryResolution = {
    absolutePath: string;
    normalizedPath: string;
    watchFiles: string[];
};

const ORIGINAL_QUERY_PARAM = "oidc-spa-original";

export function createHandleServerEntrypoint(params: {
    resolvedConfig: ResolvedConfig;
    projectType: ProjectType;
}) {
    const { resolvedConfig, projectType } = params;

    const entryResolution = resolveEntryForProject({
        config: resolvedConfig,
        projectType
    });

    async function load_handleServerEntrypoint(params: {
        id: string;
        pluginContext: PluginContext;
    }): Promise<null | string> {
        if (entryResolution === undefined) {
            return null;
        }

        const { id, pluginContext } = params;
        const { path: rawPath, queryParams } = splitId(id);
        const normalizedRequestPath = normalizeRequestPath(rawPath);
        if (!normalizedRequestPath) {
            return null;
        }

        if (normalizedRequestPath !== entryResolution.normalizedPath) {
            return null;
        }

        const isOriginalRequest = queryParams.getAll(ORIGINAL_QUERY_PARAM).includes("true");

        if (isOriginalRequest) {
            return loadOriginalModule(entryResolution, pluginContext);
        }

        entryResolution.watchFiles.forEach(file => pluginContext.addWatchFile(file));

        const stubSourceCache = [
            `import serverEntry_original from "./${path.basename(
                entryResolution.absolutePath
            )}?${ORIGINAL_QUERY_PARAM}=true";`,
            `import { __withOidcSpaServerEntry } from "oidc-spa/react-tanstack-start";`,
            ``,
            `const serverEntry = __withOidcSpaServerEntry(serverEntry_original);`,
            ``,
            `export default serverEntry;`
        ].join("\n");

        return stubSourceCache;
    }

    return { load_handleServerEntrypoint };
}

function resolveEntryForProject({
    config,
    projectType
}: {
    config: ResolvedConfig;
    projectType: ProjectType;
}): EntryResolution | undefined {
    const root = config.root;

    switch (projectType) {
        case "tanstack-start": {
            const candidate = resolveCandidate({
                root,
                subDirectories: ["src"],
                filenames: ["server.ts", "server.js", "server.tsx", "server.jsx"]
            });

            const entryPath =
                candidate ??
                resolvePackageFile("@tanstack/react-start", [
                    "dist",
                    "plugin",
                    "default-entry",
                    "server.ts"
                ]);

            const normalized = normalizeAbsolute(entryPath);

            const resolution: EntryResolution = {
                absolutePath: entryPath,
                normalizedPath: normalized,
                watchFiles: [entryPath]
            };

            return resolution;
        }
        case "react-router-framework":
        case "other":
            return undefined;
        default:
            assert<Equals<typeof projectType, never>>(false);
    }
}

function loadOriginalModule(
    entry: EntryResolution,
    context: { addWatchFile(id: string): void }
): Promise<string> {
    entry.watchFiles.forEach(file => context.addWatchFile(file));
    return fs.readFile(entry.absolutePath, "utf8");
}
