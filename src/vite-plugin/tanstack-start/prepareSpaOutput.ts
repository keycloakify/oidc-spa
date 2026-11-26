import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse } from "../../vendor/build-runtime/parse5";
import { SPA_DOCUMENT_ATTRIBUTE } from "./spaRouting";

export async function prepareSpaOutput(publicDir: string, basePath: string) {
    // Vite and Start write paths relative to the application's base. CDN assets
    // are addressed from the domain root, so mount the completed output there.
    if (basePath !== "/") {
        const temporaryDir = await mkdtemp(join(dirname(publicDir), ".oidc-spa-static-"));
        const entries = await readdir(publicDir);
        try {
            for (const entry of entries) await rename(join(publicDir, entry), join(temporaryDir, entry));
            const mountedDir = join(publicDir, basePath.slice(1));
            await mkdir(mountedDir, { recursive: true });
            for (const entry of entries) {
                // Platform control files always belong at the publish root.
                const directory = ["_redirects", "_headers"].includes(entry) ? publicDir : mountedDir;
                await rename(join(temporaryDir, entry), join(directory, entry));
            }
        } finally {
            await rm(temporaryDir, { recursive: true, force: true });
        }
    }

    async function markDocuments(directory: string): Promise<void> {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                await markDocuments(path);
            } else if (entry.name.endsWith(".html")) {
                const html = await readFile(path, "utf8");
                const document = parse(html, { sourceCodeLocationInfo: true });
                const root = document.childNodes.find(
                    node => "tagName" in node && node.tagName === "html"
                );
                if (
                    root === undefined ||
                    !("attrs" in root) ||
                    root.attrs.some(({ name }) => name === SPA_DOCUMENT_ATTRIBUTE)
                )
                    continue;
                const offset = root.sourceCodeLocation?.startTag?.endOffset;
                if (offset === undefined) continue;
                await writeFile(
                    path,
                    html.slice(0, offset - 1) + ` ${SPA_DOCUMENT_ATTRIBUTE}` + html.slice(offset - 1)
                );
            }
        }
    }
    await markDocuments(publicDir);
}
