import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
//import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ResolvedConfig } from "vite";
import { normalizePath } from "vite";
import { detectProjectType, type ProjectType } from "./detectProjectType";

//import { MagicString } from "../vendor/build-runtime/magic-string";

//const require = createRequire(import.meta.url);
const ORIGINAL_QUERY_PARAM = "oidc-spa-original";
const ORIGINAL_QUERY_VALUE = "true";

type OidcSpaVitePluginParams = {
    freezeFetch?: boolean;
    freezeXMLHttpRequest?: boolean;
    freezeWebSocket?: boolean;
};

type EarlyInitOptionKey =
    | "freezeFetch"
    | "freezeXMLHttpRequest"
    | "freezeWebSocket"
    | "isPostLoginRedirectManual";

type EntryResolution = {
    projectType: ProjectType;
    absolutePath: string;
    normalizedPath: string;
    dynamicImportSpecifier: string;
    watchFiles: string[];
    stubImports: string[];
    stubPrologueStatements: string[];
    earlyInitOptionsLiteral: string;
    description: string;
};

const GENERIC_ENTRY_CANDIDATES = ["src/main.tsx", "src/main.ts", "src/main.jsx", "src/main.js"];

const REACT_ROUTER_ENTRY_CANDIDATES = [
    "entry.client.tsx",
    "entry.client.ts",
    "entry.client.jsx",
    "entry.client.js"
];

const TANSTACK_ENTRY_CANDIDATES = ["client.tsx", "client.ts", "client.jsx", "client.js"];

export function oidcSpa(params: OidcSpaVitePluginParams = {}) {
    let projectType: ProjectType | undefined;
    let entryResolution: EntryResolution | undefined;
    let stubSourceCache: string | undefined;

    const plugin: Plugin = {
        name: "oidc-spa",
        enforce: "pre",
        configResolved(config) {
            projectType = detectProjectType(config);
            entryResolution = resolveEntryForProject({
                config,
                projectType,
                params
            });
        },
        load(id) {
            if (!entryResolution) {
                return null;
            }

            const { path: rawPath, queryParams } = splitId(id);
            const normalizedRequestPath = normalizeRequestPath(rawPath);
            if (!normalizedRequestPath) {
                return null;
            }

            if (normalizedRequestPath !== entryResolution.normalizedPath) {
                return null;
            }

            const isOriginalRequest = queryParams
                .getAll(ORIGINAL_QUERY_PARAM)
                .includes(ORIGINAL_QUERY_VALUE);

            if (isOriginalRequest) {
                queryParams.delete(ORIGINAL_QUERY_PARAM);
                return loadOriginalModule(entryResolution, this);
            }

            if (!stubSourceCache) {
                stubSourceCache = createStubSource(entryResolution);
            }
            entryResolution.watchFiles.forEach(file => this.addWatchFile(file));

            console.log("=======>", stubSourceCache);

            return stubSourceCache;
        }
    };

    return plugin;
}

function resolveEntryForProject({
    config,
    projectType,
    params
}: {
    config: ResolvedConfig;
    projectType: ProjectType;
    params: OidcSpaVitePluginParams;
}): EntryResolution | undefined {
    const logger = config.logger;
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

            if (!entryPath) {
                logger.warn(
                    "[oidc-spa] Unable to locate TanStack Start client entry. Skipping automatic early-init injection."
                );
                return undefined;
            }

            const normalized = normalizeAbsolute(entryPath);

            const earlyInitOptions = createEarlyInitOptionsLiteral({
                freezeFetch: params.freezeFetch ?? true,
                freezeXMLHttpRequest: params.freezeXMLHttpRequest ?? true,
                freezeWebSocket: params.freezeWebSocket ?? true,
                isPostLoginRedirectManual: true
            });

            const resolution: EntryResolution = {
                projectType,
                absolutePath: entryPath,
                normalizedPath: normalized,
                dynamicImportSpecifier: buildLazyImportSpecifier(entryPath),
                watchFiles: candidate ? [entryPath] : [],
                stubImports: [
                    'import { preventConsoleLoggingOfUnifiedClientRetryForSsrLoadersError } from "oidc-spa/react-tanstack-start/rfcUnifiedClientRetryForSsrLoaders/entrypoint";'
                ],
                stubPrologueStatements: [
                    "preventConsoleLoggingOfUnifiedClientRetryForSsrLoadersError();"
                ],
                earlyInitOptionsLiteral: earlyInitOptions,
                description: candidate
                    ? path.relative(root, entryPath)
                    : "@tanstack/react-start default client entry"
            };

            logger.info(`[oidc-spa] Injecting early-init wrapper into ${resolution.description}.`);

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

            if (!entryPath) {
                logger.warn(
                    "[oidc-spa] Unable to locate React Router client entry. Skipping automatic early-init injection."
                );
                return undefined;
            }

            const normalized = normalizeAbsolute(entryPath);

            const earlyInitOptions = createEarlyInitOptionsLiteral({
                freezeFetch: params.freezeFetch ?? true,
                freezeXMLHttpRequest: params.freezeXMLHttpRequest ?? true,
                freezeWebSocket: params.freezeWebSocket ?? true
            });

            const resolution: EntryResolution = {
                projectType,
                absolutePath: entryPath,
                normalizedPath: normalized,
                dynamicImportSpecifier: buildLazyImportSpecifier(entryPath),
                watchFiles: candidate ? [entryPath] : [],
                stubImports: [],
                stubPrologueStatements: [],
                earlyInitOptionsLiteral: earlyInitOptions,
                description: candidate
                    ? path.relative(root, entryPath)
                    : "@react-router/dev default client entry"
            };

            logger.info(`[oidc-spa] Injecting early-init wrapper into ${resolution.description}.`);

            return resolution;
        }

        case "other": {
            const candidate = resolveCandidate({
                root,
                subDirectories: ["."],
                filenames: GENERIC_ENTRY_CANDIDATES
            });

            if (!candidate) {
                logger.warn(
                    "[oidc-spa] Unable to find a Vite entry module (looked for src/main.{ts,tsx,js,jsx}). Skipping automatic early-init injection."
                );
                return undefined;
            }

            const normalized = normalizeAbsolute(candidate);

            const earlyInitOptions = createEarlyInitOptionsLiteral({
                freezeFetch: params.freezeFetch ?? true,
                freezeXMLHttpRequest: params.freezeXMLHttpRequest ?? true,
                freezeWebSocket: params.freezeWebSocket ?? true
            });

            const resolution: EntryResolution = {
                projectType,
                absolutePath: candidate,
                normalizedPath: normalized,
                dynamicImportSpecifier: buildLazyImportSpecifier(candidate),
                watchFiles: [candidate],
                stubImports: [],
                stubPrologueStatements: [],
                earlyInitOptionsLiteral: earlyInitOptions,
                description: path.relative(root, candidate)
            };

            logger.info(`[oidc-spa] Injecting early-init wrapper into ${resolution.description}.`);

            return resolution;
        }

        default:
            logger.warn(
                `[oidc-spa] Unsupported project type "${projectType}". Skipping automatic early-init injection.`
            );
            return undefined;
    }
}

function loadOriginalModule(
    entry: EntryResolution,
    context: { addWatchFile(id: string): void }
): Promise<string> {
    entry.watchFiles.forEach(file => context.addWatchFile(file));
    return fs.readFile(entry.absolutePath, "utf8");
}

function createStubSource(entry: EntryResolution): string {
    const lines: string[] = [];

    lines.push('import { oidcEarlyInit } from "oidc-spa/entrypoint";');
    entry.stubImports.forEach(importLine => lines.push(importLine));

    if (lines.length > 0) {
        lines.push("");
    }

    lines.push(`const { shouldLoadApp } = oidcEarlyInit(${entry.earlyInitOptionsLiteral});`);

    if (entry.stubPrologueStatements.length > 0) {
        entry.stubPrologueStatements.forEach(statement => lines.push(statement));
        lines.push("");
    } else {
        lines.push("");
    }

    lines.push("console.log('yes indeed')");

    lines.push("if (shouldLoadApp) {");
    lines.push(`    import(${JSON.stringify(addOriginalQuery(entry.dynamicImportSpecifier))});`);
    lines.push("}");
    lines.push("");

    return lines.join("\n");
}

function resolveCandidate({
    root,
    subDirectories,
    filenames
}: {
    root: string;
    subDirectories: string[];
    filenames: string[];
}): string | undefined {
    for (const subDirectory of subDirectories) {
        for (const filename of filenames) {
            const candidate = path.resolve(root, subDirectory, filename);
            if (existsSync(candidate)) {
                return candidate;
            }
        }
    }
    return undefined;
}

function resolvePackageFile(packageName: string, segments: string[]): string | undefined {
    try {
        const pkgPath = require.resolve(`${packageName}/package.json`);
        return path.resolve(path.dirname(pkgPath), ...segments);
    } catch {
        return undefined;
    }
}

function normalizeAbsolute(filePath: string): string {
    return normalizePath(filePath);
}

function buildLazyImportSpecifier(filePath: string): string {
    const baseName = path.basename(filePath);
    return `./${baseName}`;
}

function addOriginalQuery(specifier: string): string {
    const hasQuery = specifier.includes("?");
    const separator = hasQuery ? "&" : "?";
    return `${specifier}${separator}${ORIGINAL_QUERY_PARAM}=${ORIGINAL_QUERY_VALUE}`;
}

function splitId(id: string): { path: string; queryParams: URLSearchParams } {
    const queryIndex = id.indexOf("?");
    if (queryIndex === -1) {
        return { path: id, queryParams: new URLSearchParams() };
    }

    const pathPart = id.slice(0, queryIndex);
    const queryString = id.slice(queryIndex + 1);
    return { path: pathPart, queryParams: new URLSearchParams(queryString) };
}

function normalizeRequestPath(id: string): string | undefined {
    let requestPath = id;

    if (requestPath.startsWith("\0")) {
        requestPath = requestPath.slice(1);
    }

    if (requestPath.startsWith("/@fs/")) {
        requestPath = requestPath.slice("/@fs/".length);
    } else if (requestPath.startsWith("file://")) {
        requestPath = fileURLToPath(requestPath);
    }

    if (path.isAbsolute(requestPath) || requestPath.startsWith(".")) {
        return normalizePath(requestPath);
    }

    return normalizePath(requestPath);
}

function createEarlyInitOptionsLiteral(options: Partial<Record<EarlyInitOptionKey, boolean>>): string {
    const orderedKeys: EarlyInitOptionKey[] = [
        "freezeFetch",
        "freezeXMLHttpRequest",
        "freezeWebSocket",
        "isPostLoginRedirectManual"
    ];

    const lines: string[] = [];

    orderedKeys.forEach(key => {
        const value = options[key];
        if (typeof value === "boolean") {
            lines.push(`    ${key}: ${value}`);
        }
    });

    if (lines.length === 0) {
        return "{}";
    }

    const lastIndex = lines.length - 1;
    return `{\n${lines.map((line, index) => (index === lastIndex ? line : `${line},`)).join("\n")}\n}`;
}
