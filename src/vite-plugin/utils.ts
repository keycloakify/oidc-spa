import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePath } from "vite";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export function resolveCandidate({
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

export function resolvePackageFile(packageName: string, segments: string[]): string {
    const pkgPath = require.resolve(`${packageName}/package.json`);
    return path.resolve(path.dirname(pkgPath), ...segments);
}

export function normalizeAbsolute(filePath: string): string {
    return normalizePath(filePath);
}

export function splitId(id: string): { path: string; queryParams: URLSearchParams } {
    const queryIndex = id.indexOf("?");
    if (queryIndex === -1) {
        return { path: id, queryParams: new URLSearchParams() };
    }

    const pathPart = id.slice(0, queryIndex);
    const queryString = id.slice(queryIndex + 1);
    return { path: pathPart, queryParams: new URLSearchParams(queryString) };
}

export function normalizeRequestPath(id: string): string {
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
