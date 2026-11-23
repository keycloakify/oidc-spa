import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import type { NitroOutput } from "./nitroOutput";
import { BACKEND_PATHS, STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX } from "./spaRouting";
import { babelParser, babelTypes as t } from "../../vendor/build-runtime/babel";
import { MagicString } from "../../vendor/build-runtime/magic-string";

// TODO: This needs update

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

export async function patchNetlifyOutput(output: NitroOutput) {
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
                source.overwrite(
                    property.value.start,
                    property.value.end,
                    JSON.stringify(BACKEND_PATHS)
                );
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
    const fallback = "/* /_shell.html 200";
    if (!redirects.split("\n").includes(fallback)) {
        await writeFile(redirectsPath, redirects.trimEnd() + "\n" + fallback + "\n");
    }

    // Netlify query matching requires an exact parameter set, whereas providers
    // may return additional callback parameters. An edge function checks just
    // our state prefix and rewrites to the CDN file, preserving the browser URL.
    const dir = join(dirname(output.dir), "edge-functions");
    await mkdir(dir, { recursive: true });
    await writeFile(
        join(dir, `${callbackName}.js`),
        `export default function(request) {
    const url = new URL(request.url);
    if (url.pathname === "/" && (request.method === "GET" || request.method === "HEAD") &&
        url.searchParams.get("state")?.startsWith(${JSON.stringify(
            STATE_QUERY_PARAM_VALUE_IDENTIFIER_PREFIX
        )})) {
        return new URL("/_shell.html", url);
    }
}
export const config = { path: "/" };
`
    );
    // Nitro's older functions-internal layout needs an explicit edge manifest.
    // The current Frameworks API discovers the function's exported config itself.
    if (basename(output.dir) === "functions-internal") {
        const path = join(dir, "manifest.json");
        const manifest = existsSync(path)
            ? JSON.parse(await readFile(path, "utf8"))
            : { version: 1, functions: [] };
        manifest.functions = manifest.functions.filter(
            (entry: { function: string }) => entry.function !== callbackName
        );
        manifest.functions.unshift({ function: callbackName, path: "/" });
        await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
    }
}
