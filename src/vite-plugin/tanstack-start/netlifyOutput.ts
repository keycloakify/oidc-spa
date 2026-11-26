import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { NitroOutput } from "./nitroOutput";
import { getSpaPaths } from "./spaRouting";
import { babelParser, babelTypes as t } from "../../vendor/build-runtime/babel";
import { MagicString } from "../../vendor/build-runtime/magic-string";

const callbackName = "oidc-spa-callback";

export async function removeNetlifyCallback(output: NitroOutput) {
    const dir = join(dirname(output.dir), "edge-functions");
    await rm(join(dir, `${callbackName}.js`), { force: true });
    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) return;
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.functions = manifest.functions.filter(
        (entry: { function: string }) => entry.function !== callbackName
    );
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

export async function patchNetlifyOutput(output: NitroOutput, base = "/") {
    const { basePath, callback, shell, backend } = getSpaPaths(base);
    const entryPath = join(output.serverDir, "server.mjs");
    const original = await readFile(entryPath, "utf8");
    // Netlify statically reads this exported object; importing or spreading a
    // config silently loses its settings. Replace only the path's AST range.
    const ast = babelParser.parse(original, { sourceType: "module" });
    let patched = false;
    const source = new MagicString(original);
    for (const statement of ast.program.body) {
        if (!t.isExportNamedDeclaration(statement) || !t.isVariableDeclaration(statement.declaration))
            continue;
        for (const declaration of statement.declaration.declarations) {
            if (
                !t.isIdentifier(declaration.id, { name: "config" }) ||
                !t.isObjectExpression(declaration.init)
            )
                continue;
            for (const property of declaration.init.properties) {
                if (
                    !t.isObjectProperty(property) ||
                    property.computed ||
                    !(
                        t.isIdentifier(property.key, { name: "path" }) ||
                        t.isStringLiteral(property.key, { value: "path" })
                    )
                )
                    continue;
                if (property.value.start == null || property.value.end == null) continue;
                source.overwrite(property.value.start, property.value.end, JSON.stringify(backend));
                patched = true;
            }
        }
    }
    if (!patched)
        throw new Error("oidc-spa: Expected an exported path in Nitro's Netlify function config");
    // Function routing precedes static redirects. Narrow Nitro to the backend so
    // page misses reach the CDN shell rewrite instead of request-time rendering.
    await writeFile(entryPath, source.toString());
    const redirectsPath = join(output.publicDir, "_redirects");
    const redirects = existsSync(redirectsPath) ? await readFile(redirectsPath, "utf8") : "";
    const callbackRule = `${callback} ${shell} 200!`;
    const fallbackRule = `${basePath}* ${shell} 200`;
    const existing = redirects
        .split("\n")
        .filter(line => line !== callbackRule && line !== fallbackRule);
    // The reserved callback must win even over a user-supplied catch-all.
    // Leave all other redirects in order and keep the SPA fallback last.
    await writeFile(
        redirectsPath,
        [callbackRule, ...existing.filter(line => line.trim() !== ""), fallbackRule, ""].join("\n")
    );
    // Remove the query-dependent dispatcher from previous oidc-spa builds.
    await removeNetlifyCallback(output);
}
