import type { OidcSpaVitePluginParams } from "./vite-plugin";
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

const GENERIC_ENTRY_CANDIDATES = ["src/main.tsx", "src/main.ts", "src/main.jsx", "src/main.js"];

const REACT_ROUTER_ENTRY_CANDIDATES = [
    "entry.client.tsx",
    "entry.client.ts",
    "entry.client.jsx",
    "entry.client.js"
];

const TANSTACK_ENTRY_CANDIDATES = ["client.tsx", "client.ts", "client.jsx", "client.js"];

export function createHandleClientEntrypoint(params: {
    oidcSpaVitePluginParams: OidcSpaVitePluginParams;
    resolvedConfig: ResolvedConfig;
    projectType: ProjectType;
}) {
    const { oidcSpaVitePluginParams, resolvedConfig, projectType } = params;

    const entryResolution = resolveEntryForProject({
        config: resolvedConfig,
        projectType
    });

    async function load_handleClientEntrypoint(params: {
        id: string;
        pluginContext: PluginContext;
    }): Promise<null | string> {
        const { id, pluginContext } = params;
        const { path: rawPath, queryParams } = splitId(id);

        const normalizedRequestPath = normalizeRequestPath(rawPath);
        const isMatch =
            normalizedRequestPath && normalizedRequestPath === entryResolution.normalizedPath;

        if (!isMatch) {
            return null;
        }

        const isOriginalRequest = queryParams.getAll(ORIGINAL_QUERY_PARAM).includes("true");

        if (isOriginalRequest) {
            return loadOriginalModule(entryResolution, pluginContext);
        }

        entryResolution.watchFiles.forEach(file => pluginContext.addWatchFile(file));

        const { freezeFetch, freezeXMLHttpRequest, freezeWebSocket, freezePromise, safeMode, ...rest } =
            oidcSpaVitePluginParams ?? {};

        assert<Equals<typeof rest, {}>>;

        const originalEntryImport = `import("./${path.basename(
            entryResolution.absolutePath
        )}?${ORIGINAL_QUERY_PARAM}=true")`;

        // For Nuxt, resolvedConfig.base points to the public directory of assets, not the dynamic baseURL.
        // We need to extract the baseURL from Nuxt's runtime config to handle dynamic base paths correctly.
        const nuxtRuntimeConfig =
            projectType === "nuxt"
                ? [
                      `const useRuntimeConfig = () => window?.__NUXT__?.config || window?.useNuxtApp?.().payload?.config;`,
                      `const getAppConfig = () => useRuntimeConfig()?.app;`,
                      `const baseURL = () => getAppConfig()?.baseURL;`
                  ]
                : [];

        const baseUrl = projectType === "nuxt" ? "baseURL()" : `"${resolvedConfig.base}"`;

        const oidcParams = [
            `freezeFetch: ${freezeFetch},`,
            `freezeXMLHttpRequest: ${freezeXMLHttpRequest},`,
            `freezeWebSocket: ${freezeWebSocket},`,
            `freezePromise: ${freezePromise},`,
            `safeMode: ${safeMode},`,
            `BASE_URL: ${baseUrl}`
        ];

        // Use Object.assign to force Rollup to preserve all properties
        const stubSourceCache = [
            `import { oidcEarlyInit } from "oidc-spa/entrypoint";`,
            ...nuxtRuntimeConfig,
            `const _oidc_params = Object.assign({}, {`,
            ...oidcParams,
            `});`,
            `const { shouldLoadApp } = oidcEarlyInit(_oidc_params);`,
            ``,
            `if (shouldLoadApp) {`,
            `    ${originalEntryImport};`,
            `}`
        ]
            .filter(line => typeof line === "string")
            .join("\n");

        return stubSourceCache;
    }

    return { load_handleClientEntrypoint };
}

function resolveEntryForProject({
    config,
    projectType
}: {
    config: ResolvedConfig;
    projectType: ProjectType;
}): EntryResolution {
    const root = config.root;

    switch (projectType) {
        case "tanstack-start": {
            const candidate = resolveCandidate({
                root,
                subDirectories: ["src"],
                filenames: TANSTACK_ENTRY_CANDIDATES
            });

            const entryPath =
                candidate ??
                resolvePackageFile("@tanstack/react-start", [
                    "dist",
                    "plugin",
                    "default-entry",
                    "client.tsx"
                ]);

            const normalized = normalizeAbsolute(entryPath);

            const resolution: EntryResolution = {
                absolutePath: entryPath,
                normalizedPath: normalized,
                watchFiles: candidate ? [entryPath] : []
            };

            return resolution;
        }

        case "react-router-framework": {
            const candidate = resolveCandidate({
                root,
                subDirectories: ["app"],
                filenames: REACT_ROUTER_ENTRY_CANDIDATES
            });

            const entryPath =
                candidate ??
                resolvePackageFile("@react-router/dev", [
                    "dist",
                    "config",
                    "defaults",
                    "entry.client.tsx"
                ]);

            const normalized = normalizeAbsolute(entryPath);

            const resolution: EntryResolution = {
                absolutePath: entryPath,
                normalizedPath: normalized,
                watchFiles: candidate ? [entryPath] : []
            };

            return resolution;
        }

        case "nuxt": {
            const rollupInput = config.build.rollupOptions?.input;

            let entryPath: string;

            if (typeof rollupInput === "string") {
                entryPath = rollupInput;
            } else if (Array.isArray(rollupInput)) {
                assert(rollupInput.length > 0, "Nuxt rollupOptions.input array is empty");
                entryPath = rollupInput[0];
            } else if (rollupInput && typeof rollupInput === "object") {
                const inputRecord = rollupInput;
                assert(
                    Object.keys(inputRecord).length > 0,
                    "Nuxt rollupOptions.input object must contain at least one entry"
                );
                entryPath = Object.values(inputRecord)[0];
            } else {
                throw new Error(
                    "Could not resolve Nuxt entry point from Vite config. " +
                        "rollupOptions.input is undefined or has an unexpected type."
                );
            }

            // Ensure entryPath is absolute before normalizing.
            // Nuxt's rollupOptions.input can be relative, but Vite resolves IDs to absolute paths.
            const absoluteEntryPath = path.isAbsolute(entryPath)
                ? entryPath
                : path.resolve(root, entryPath);

            const normalized = normalizeAbsolute(absoluteEntryPath);

            const resolution: EntryResolution = {
                absolutePath: absoluteEntryPath,
                normalizedPath: normalized,
                // Nuxt's entry is generated/virtual and managed internally; watching not needed
                watchFiles: []
            };

            return resolution;
        }

        case "other": {
            const candidate = resolveCandidate({
                root,
                subDirectories: ["."],
                filenames: GENERIC_ENTRY_CANDIDATES
            });

            assert(candidate !== undefined);

            const normalized = normalizeAbsolute(candidate);

            const resolution: EntryResolution = {
                absolutePath: candidate,
                normalizedPath: normalized,
                watchFiles: [candidate]
            };

            return resolution;
        }

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
