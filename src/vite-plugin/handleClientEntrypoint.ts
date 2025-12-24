import type { OidcSpaVitePluginParams } from "./vite-plugin";
import type { ResolvedConfig } from "vite";
import type { PluginContext } from "rollup";
import { promises as fs, readFileSync, existsSync } from "node:fs";
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
            entryResolution.watchFiles.forEach(file => pluginContext.addWatchFile(file));
            return fs.readFile(entryResolution.absolutePath, "utf8");
        }

        entryResolution.watchFiles.forEach(file => pluginContext.addWatchFile(file));

        return [
            `import { oidcEarlyInit } from "oidc-spa/entrypoint";`,
            `const { shouldLoadApp } = oidcEarlyInit({`,
            ...(() => {
                assert<Equals<typeof oidcSpaVitePluginParams, {}>>;
                return [
                    `   BASE_URL: ${(() => {
                        switch (projectType) {
                            case "nuxt":
                                return "__NUXT__.config.app.baseURL";
                            default:
                                return `"${resolvedConfig.base}"`;
                        }
                    })()}`
                ];
            })(),
            `});`,
            ``,
            `if (shouldLoadApp) {`,
            // prettier-ignore
            `    import("./${path.basename(entryResolution.absolutePath)}?${ORIGINAL_QUERY_PARAM}=true");`,
            `}`
        ].join("\n");
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
            const indexHtmlPath = (() => {
                const rollupInput = config.build.rollupOptions?.input;

                const htmlCandidates: string[] = [];

                const addCandidate = (maybePath: string) => {
                    const candidate = path.isAbsolute(maybePath)
                        ? maybePath
                        : path.resolve(root, maybePath);

                    if (path.extname(candidate).toLowerCase() === ".html") {
                        htmlCandidates.push(candidate);
                    }
                };

                if (typeof rollupInput === "string") {
                    addCandidate(rollupInput);
                } else if (Array.isArray(rollupInput)) {
                    rollupInput.forEach(addCandidate);
                } else if (rollupInput && typeof rollupInput === "object") {
                    Object.values(rollupInput).forEach(addCandidate);
                }

                if (htmlCandidates.length > 1) {
                    throw new Error(
                        [
                            "oidc-spa: Multiple HTML inputs detected in Vite configuration.",
                            `Found: ${htmlCandidates.join(", ")}.`,
                            "No worries, if the oidc-spa Vite plugin fails you can still configure the client entrypoint manually.",
                            "Please refer to the documentation for more details."
                        ].join(" ")
                    );
                }

                const defaultIndexHtml = path.resolve(root, "index.html");

                const indexHtmlPath =
                    htmlCandidates[0] ?? (existsSync(defaultIndexHtml) ? defaultIndexHtml : undefined);

                if (indexHtmlPath === undefined) {
                    throw new Error(
                        [
                            "oidc-spa: Could not locate index.html.",
                            "Checked Vite rollupOptions.input for HTML entries and the default index.html at the project root.",
                            "No worries, if the oidc-spa Vite plugin fails you can still configure the client entrypoint manually.",
                            "Please refer to the documentation for more details."
                        ].join(" ")
                    );
                }

                return indexHtmlPath;
            })();

            const indexHtmlContent = readFileSync(indexHtmlPath, "utf8");

            const bodyMatch = indexHtmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            const bodyContent = bodyMatch?.[1] ?? indexHtmlContent;

            const moduleScriptSrcs: string[] = [];
            const scriptRegex =
                /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

            let match: RegExpExecArray | null;
            // eslint-disable-next-line no-cond-assign
            while ((match = scriptRegex.exec(bodyContent)) !== null) {
                const [, src] = match;
                moduleScriptSrcs.push(src);
            }

            if (moduleScriptSrcs.length === 0) {
                throw new Error(
                    [
                        'oidc-spa: Could not find a <script type="module" src="..."> tag in index.html.',
                        "No worries, if the oidc-spa Vite plugin fails you can still configure the client entrypoint manually.",
                        "Please refer to the documentation for more details."
                    ].join(" ")
                );
            }

            if (moduleScriptSrcs.length > 1) {
                throw new Error(
                    [
                        "oidc-spa: Unable to determine a unique client entrypoint from index.html.",
                        `Found multiple <script type=\"module\" src=\"...\"> tags: ${moduleScriptSrcs.join(
                            ", "
                        )}.`,
                        "No worries, if the oidc-spa Vite plugin fails you can still configure the client entrypoint manually.",
                        "Please refer to the documentation for more details."
                    ].join(" ")
                );
            }

            const [rawSrc] = moduleScriptSrcs;
            const cleanedSrc = rawSrc.replace(/[?#].*$/, "");

            if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(cleanedSrc)) {
                throw new Error(
                    [
                        "oidc-spa: The client entrypoint in index.html points to an external URL,",
                        `got "${rawSrc}".`,
                        "\nNo worries, if the oidc-spa Vite plugin fails you can still configure the client entrypoint manually.",
                        "Please refer to the documentation for more details."
                    ].join(" ")
                );
            }

            const indexDir = path.dirname(indexHtmlPath);

            const absoluteCandidates = (() => {
                const resolvedPath = cleanedSrc.startsWith("/")
                    ? path.join(root, cleanedSrc.replace(/^\//, ""))
                    : path.resolve(indexDir, cleanedSrc);

                const hasExtension = path.extname(resolvedPath) !== "";

                if (hasExtension) {
                    return [resolvedPath];
                }

                const extensions = [".tsx", ".ts", ".jsx", ".js"];

                return extensions.map(ext => `${resolvedPath}${ext}`);
            })();

            const existingCandidate = absoluteCandidates.find(candidate => existsSync(candidate));

            if (!existingCandidate) {
                throw new Error(
                    [
                        "oidc-spa: Could not locate the client entrypoint referenced in index.html.",
                        `Found src="${rawSrc}" and tried: ${absoluteCandidates.join(", ")}.`,
                        "Please ensure the file exists or configure the client entrypoint manually.",
                        "\nNo worries, if the oidc-spa Vite plugin fails you can still configure the client entrypoint manually.",
                        "Please refer to the documentation for more details."
                    ].join(" ")
                );
            }

            return {
                absolutePath: existingCandidate,
                normalizedPath: normalizeAbsolute(existingCandidate),
                watchFiles: [indexHtmlPath, existingCandidate]
            };
        }

        default:
            assert<Equals<typeof projectType, never>>(false);
    }
}
