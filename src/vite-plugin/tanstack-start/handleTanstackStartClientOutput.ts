import * as path from "node:path";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ResolvedConfig, Rollup } from "vite";

const BOOTSTRAP_ENTRY_ID = "virtual:oidc-spa/tanstack-start-client-bootstrap";
const RESOLVED_BOOTSTRAP_ENTRY_ID = `\0${BOOTSTRAP_ENTRY_ID}`;
const APPLICATION_ENTRY_PLACEHOLDER = "oidc-spa:tanstack-start-application-entry";

type PluginContextWithEnvironment = Rollup.PluginContext & {
    environment?: {
        name?: string;
    };
};

type MutableOutputChunk = {
    map: Rollup.SourceMap | null;
};

type OutputChunkWithViteMetadata = {
    viteMetadata?: {
        importedAssets: Set<string>;
        importedCss: Set<string>;
        __modules?: Rollup.OutputChunk["modules"];
    };
};

export function createHandleTanstackStartClientOutput(params: {
    resolvedConfig: ResolvedConfig;
    getClientEntrypointSource: (params: { applicationEntrypointImportSpecifier: string }) => string;
}) {
    const { resolvedConfig, getClientEntrypointSource } = params;

    const bootstrapSource = getClientEntrypointSource({
        applicationEntrypointImportSpecifier: APPLICATION_ENTRY_PLACEHOLDER
    });
    const applicationEntryBuildMarker = getApplicationEntryBuildMarker({ bootstrapSource });

    function resolveId(id: string): null | string | { id: string; external: true } {
        if (id === BOOTSTRAP_ENTRY_ID) {
            return RESOLVED_BOOTSTRAP_ENTRY_ID;
        }

        if (id === APPLICATION_ENTRY_PLACEHOLDER) {
            return { id, external: true };
        }

        return null;
    }

    function load(id: string): null | string {
        return id === RESOLVED_BOOTSTRAP_ENTRY_ID ? bootstrapSource : null;
    }

    function buildStart(this: Rollup.PluginContext): void {
        if (!isClientEnvironment({ pluginContext: this, resolvedConfig })) {
            return;
        }

        // This keeps the bootstrap independent from the application graph. The
        // temporary entry is finalized and removed before TanStack captures it.
        this.emitFile({
            type: "chunk",
            id: BOOTSTRAP_ENTRY_ID,
            name: "oidc-spa-bootstrap",
            preserveSignature: false
        });
    }

    async function generateBundle(
        this: Rollup.PluginContext,
        _options: Rollup.NormalizedOutputOptions,
        bundle: Rollup.OutputBundle
    ): Promise<void> {
        if (!isClientEnvironment({ pluginContext: this, resolvedConfig })) {
            return;
        }

        const bootstrapChunk = Object.values(bundle).find(
            (output): output is Rollup.OutputChunk =>
                output.type === "chunk" && output.moduleIds.includes(RESOLVED_BOOTSTRAP_ENTRY_ID)
        );

        if (bootstrapChunk === undefined) {
            this.error("oidc-spa: The TanStack Start client bootstrap chunk was not emitted.");
        }

        const applicationEntryChunks = Object.values(bundle).filter(
            (output): output is Rollup.OutputChunk =>
                output.type === "chunk" && output.isEntry && output !== bootstrapChunk
        );

        if (applicationEntryChunks.length !== 1) {
            this.error(
                `oidc-spa: Expected exactly one TanStack Start client entry chunk, found ${applicationEntryChunks.length}.`
            );
        }

        const [entryChunk] = applicationEntryChunks;

        assertBootstrapSynchronousGraphIsIsolated({
            pluginContext: this,
            bundle,
            bootstrapChunk,
            applicationEntryChunk: entryChunk
        });

        const applicationEntryFileName = getApplicationEntryFileName({
            entryFileName: entryChunk.fileName,
            bundle
        });

        for (const output of Object.values(bundle)) {
            if (output.type !== "chunk") {
                continue;
            }

            rewriteChunkEntryReferences({
                chunk: output,
                previousEntryFileName: entryChunk.fileName,
                applicationEntryFileName
            });
        }

        const applicationEntryCode = entryChunk.code;
        const applicationEntryMap = entryChunk.map;
        const outputHash = createHash("sha256")
            .update(applicationEntryCode)
            .update("\0")
            .update(bootstrapChunk.code)
            .digest("base64url")
            .slice(0, 12);
        const finalizedBootstrapFileName = addFileNameSuffix({
            fileName: bootstrapChunk.fileName,
            suffix: outputHash
        });

        const finalizedBootstrapCode = replaceApplicationEntryPlaceholder({
            code: bootstrapChunk.code,
            applicationEntryImportSpecifier: toRelativeImportSpecifier({
                importerFileName: finalizedBootstrapFileName,
                importedFileName: applicationEntryFileName
            })
        });

        delete bundle[bootstrapChunk.fileName];

        this.emitFile({
            type: "prebuilt-chunk",
            fileName: finalizedBootstrapFileName,
            code: finalizedBootstrapCode,
            exports: bootstrapChunk.exports
        });

        this.emitFile({
            type: "prebuilt-chunk",
            fileName: applicationEntryFileName,
            code: applicationEntryCode,
            exports: entryChunk.exports,
            map:
                applicationEntryMap === null
                    ? undefined
                    : {
                          ...applicationEntryMap,
                          file: path.posix.basename(applicationEntryFileName)
                      }
        });

        for (const fileName of [finalizedBootstrapFileName, applicationEntryFileName]) {
            initializeViteMetadataForPrebuiltChunk({ bundle, fileName });
        }

        const bootstrapImportSpecifier = toRelativeImportSpecifier({
            importerFileName: entryChunk.fileName,
            importedFileName: finalizedBootstrapFileName
        });

        entryChunk.code = `import ${JSON.stringify(bootstrapImportSpecifier)};\n`;

        const mutableEntryChunk = entryChunk as unknown as MutableOutputChunk;
        mutableEntryChunk.map = null;
    }

    return { resolveId, load, buildStart, generateBundle, applicationEntryBuildMarker };
}

function initializeViteMetadataForPrebuiltChunk(params: {
    bundle: Rollup.OutputBundle;
    fileName: string;
}): void {
    const { bundle, fileName } = params;
    const output = bundle[fileName];

    if (output === undefined || output.type !== "chunk") {
        return;
    }

    const outputWithViteMetadata = output as unknown as OutputChunkWithViteMetadata;

    if (outputWithViteMetadata.viteMetadata !== undefined) {
        return;
    }

    // Rollup exposes prebuilt chunks emitted during generateBundle immediately,
    // after Vite's renderChunk metadata initializer has already run.
    outputWithViteMetadata.viteMetadata = {
        importedAssets: new Set(),
        importedCss: new Set(),
        __modules: output.modules
    };
}

function getApplicationEntryBuildMarker(params: { bootstrapSource: string }): string {
    const { bootstrapSource } = params;
    const packageVersion = findOidcSpaPackageVersion();

    const fingerprint = createHash("sha256")
        .update(packageVersion)
        .update("\0")
        .update(bootstrapSource)
        .digest("hex")
        .slice(0, 16);

    // This property read survives tree-shaking and executes only after the
    // security bootstrap elects to load the application.
    return `globalThis[${JSON.stringify(`__oidcSpaBuild_${fingerprint}`)}];`;
}

function findOidcSpaPackageVersion(): string {
    let directory = path.dirname(fileURLToPath(import.meta.url));

    while (true) {
        const packageJsonPath = path.join(directory, "package.json");

        if (existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
                name?: unknown;
                version?: unknown;
            };

            if (packageJson.name === "oidc-spa" && typeof packageJson.version === "string") {
                return packageJson.version;
            }
        }

        const parentDirectory = path.dirname(directory);

        if (parentDirectory === directory) {
            throw new Error("oidc-spa: Could not read the package version for the build marker.");
        }

        directory = parentDirectory;
    }
}

function assertBootstrapSynchronousGraphIsIsolated(params: {
    pluginContext: Rollup.PluginContext;
    bundle: Rollup.OutputBundle;
    bootstrapChunk: Rollup.OutputChunk;
    applicationEntryChunk: Rollup.OutputChunk;
}): void {
    const { pluginContext, bundle, bootstrapChunk, applicationEntryChunk } = params;
    const allowedModuleIds = new Set<string>();
    const pendingModuleIds = [RESOLVED_BOOTSTRAP_ENTRY_ID];

    while (pendingModuleIds.length !== 0) {
        const moduleId = pendingModuleIds.pop();

        if (moduleId === undefined || allowedModuleIds.has(moduleId)) {
            continue;
        }

        allowedModuleIds.add(moduleId);

        const moduleInfo = pluginContext.getModuleInfo(moduleId);

        if (moduleInfo === null) {
            continue;
        }

        pendingModuleIds.push(...moduleInfo.importedIds);
    }

    const chunksByFileName = new Map(
        Object.values(bundle)
            .filter((output): output is Rollup.OutputChunk => output.type === "chunk")
            .map(chunk => [chunk.fileName, chunk])
    );
    const pendingChunks = [bootstrapChunk];
    const visitedChunkFileNames = new Set<string>();

    while (pendingChunks.length !== 0) {
        const chunk = pendingChunks.pop();

        if (chunk === undefined || visitedChunkFileNames.has(chunk.fileName)) {
            continue;
        }

        visitedChunkFileNames.add(chunk.fileName);

        if (chunk === applicationEntryChunk) {
            throw new Error(
                "oidc-spa: TanStack Start placed the application entry in the synchronous bootstrap graph."
            );
        }

        const unexpectedModuleId = chunk.moduleIds.find(
            moduleId => !allowedModuleIds.has(moduleId) && !isViteRuntimeModule(moduleId)
        );

        if (unexpectedModuleId !== undefined) {
            throw new Error(
                `oidc-spa: TanStack Start placed an application module in the synchronous bootstrap graph: ${unexpectedModuleId}`
            );
        }

        for (const importedFileName of chunk.imports) {
            const importedChunk = chunksByFileName.get(importedFileName);

            if (importedChunk !== undefined) {
                pendingChunks.push(importedChunk);
            }
        }
    }
}

function isViteRuntimeModule(moduleId: string): boolean {
    return (
        moduleId.startsWith("\0vite/") ||
        moduleId.startsWith("\0rolldown/") ||
        moduleId.startsWith("\0commonjsHelpers") ||
        moduleId.includes("vite/preload-helper")
    );
}

function addFileNameSuffix(params: { fileName: string; suffix: string }): string {
    const { fileName, suffix } = params;
    const extension = path.posix.extname(fileName);
    if (extension === "") {
        return `${fileName}-${suffix}`;
    }
    return `${fileName.slice(0, -extension.length)}-${suffix}${extension}`;
}

function isClientEnvironment(params: {
    pluginContext: Rollup.PluginContext;
    resolvedConfig: ResolvedConfig;
}): boolean {
    const { pluginContext, resolvedConfig } = params;
    const environmentName = (pluginContext as PluginContextWithEnvironment).environment?.name;

    if (environmentName !== undefined) {
        return environmentName === "client";
    }

    return !resolvedConfig.build.ssr;
}

function getApplicationEntryFileName(params: {
    entryFileName: string;
    bundle: Rollup.OutputBundle;
}): string {
    const { entryFileName, bundle } = params;
    const directory = path.posix.dirname(entryFileName);
    const basename = path.posix.basename(entryFileName);

    for (let index = 0; index < basename.length; index++) {
        if (basename[index] !== "-") {
            continue;
        }

        const candidateBasename = `${basename.slice(0, index)}_${basename.slice(index + 1)}`;
        const candidate = path.posix.join(directory === "." ? "" : directory, candidateBasename);

        if (bundle[candidate] === undefined) {
            return candidate;
        }
    }

    for (let index = 0; index < basename.length; index++) {
        if (basename[index] === "_") {
            continue;
        }

        const candidateBasename = `${basename.slice(0, index)}_${basename.slice(index + 1)}`;
        const candidate = path.posix.join(directory === "." ? "" : directory, candidateBasename);

        if (bundle[candidate] === undefined) {
            return candidate;
        }
    }

    throw new Error(`oidc-spa: Could not allocate an application entry beside "${entryFileName}".`);
}

function rewriteChunkEntryReferences(params: {
    chunk: Rollup.OutputChunk;
    previousEntryFileName: string;
    applicationEntryFileName: string;
}): void {
    const { chunk, previousEntryFileName, applicationEntryFileName } = params;
    const previousRelativeSpecifier = toRelativeImportSpecifier({
        importerFileName: chunk.fileName,
        importedFileName: previousEntryFileName
    });
    const applicationRelativeSpecifier = toRelativeImportSpecifier({
        importerFileName: chunk.fileName,
        importedFileName: applicationEntryFileName
    });

    const replacements = new Map([
        [previousEntryFileName, applicationEntryFileName],
        [previousRelativeSpecifier, applicationRelativeSpecifier]
    ]);

    for (const [from, to] of replacements) {
        if (from === to) {
            continue;
        }

        if (from.length !== to.length) {
            throw new Error("oidc-spa: Internal entry rewrite changed generated code offsets.");
        }

        chunk.code = chunk.code.split(from).join(to);
    }
}

function replaceApplicationEntryPlaceholder(params: {
    code: string;
    applicationEntryImportSpecifier: string;
}): string {
    const { code, applicationEntryImportSpecifier } = params;
    const occurrences = code.split(APPLICATION_ENTRY_PLACEHOLDER).length - 1;

    if (occurrences !== 1) {
        throw new Error(
            `oidc-spa: Expected one application entry placeholder in the generated bootstrap, found ${occurrences}.`
        );
    }

    return code.replace(APPLICATION_ENTRY_PLACEHOLDER, applicationEntryImportSpecifier);
}

function toRelativeImportSpecifier(params: {
    importerFileName: string;
    importedFileName: string;
}): string {
    const { importerFileName, importedFileName } = params;
    const relativePath = path.posix.relative(path.posix.dirname(importerFileName), importedFileName);
    return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}
