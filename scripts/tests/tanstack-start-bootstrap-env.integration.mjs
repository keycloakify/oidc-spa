import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cp, mkdtemp, readFile, readdir, mkdir, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Run after building oidc-spa. Uses the example's installed dependencies, without
// modifying its sources, node_modules, .env, or existing build output.
test("packaged plugin builds a cold-start-safe environment endpoint", async t => {
    const repository = fileURLToPath(new URL("../../", import.meta.url));
    const example = path.join(repository, "examples/tanstack-start");
    const root = await mkdtemp(path.join(tmpdir(), "oidc-spa-env-integration-"));
    console.log(`Integration fixture: ${root}`);
    for (const name of ["src", "public", "package.json", "tsconfig.json"]) {
        await cp(path.join(example, name), path.join(root, name), { recursive: true });
    }
    // Keep the fixture independent of the example's optional browser devtools.
    await writeFile(
        path.join(root, "src/routes/__root.tsx"),
        `
        import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
        export const Route = createRootRoute({ shellComponent: ({ children }) =>
            <html><head><HeadContent /></head><body>{children}<Scripts /></body></html>
        });
    `
    );
    await mkdir(path.join(root, "node_modules"));
    for (const name of await readdir(path.join(example, "node_modules"))) {
        if (name === "oidc-spa" || name.startsWith(".")) continue;
        await symlink(path.join(example, "node_modules", name), path.join(root, "node_modules", name));
    }
    await cp(path.join(repository, "dist"), path.join(root, "node_modules/oidc-spa"), {
        recursive: true
    });
    const packageJson = JSON.parse(
        await readFile(path.join(root, "node_modules/oidc-spa/package.json"), "utf8")
    );
    const aliases = Object.entries(packageJson.exports)
        .filter(([, entry]) => entry.import)
        .map(([name, entry]) => ({
            find: name.replace(/^\./, "oidc-spa"),
            replacement: path.join(root, "node_modules/oidc-spa", entry.import)
        }))
        .sort((a, b) => b.find.length - a.find.length);
    await writeFile(
        path.join(root, "vite.config.ts"),
        `
        import { defineConfig } from "vite";
        import { tanstackStart } from "@tanstack/react-start/plugin/vite";
        import viteReact from "@vitejs/plugin-react";
        import tailwindcss from "@tailwindcss/vite";
        import { nitro } from "nitro/vite";
        import { oidcSpa } from "oidc-spa/vite-plugin";
        export default defineConfig({
            resolve: { tsconfigPaths: true, alias: ${JSON.stringify(aliases)} },
            plugins: [nitro(), tailwindcss(), tanstackStart(), oidcSpa(), viteReact()]
        });
    `
    );
    const result = await promisify(execFile)(
        process.execPath,
        [path.join(example, "node_modules/vite/bin/vite.js"), "build"],
        {
            cwd: root,
            env: {
                ...process.env,
                OIDC_USE_MOCK: "true",
                OIDC_ISSUER_URI: "https://issuer.example",
                OIDC_CLIENT_ID: "test-client"
            },
            maxBuffer: 10_000_000
        }
    ).catch(error => {
        console.error(error.stdout, error.stderr);
        throw error;
    });
    assert.match(result.stdout, /built in/);
    const files = await readdir(path.join(root, ".output/server"), { recursive: true });
    const chunks = await Promise.all(
        files
            .filter(name => name.endsWith(".mjs"))
            .map(async name => ({
                name,
                code: await readFile(path.join(root, ".output/server", name), "utf8")
            }))
    );
    const manifest = chunks.find(
        ({ code }) =>
            code.includes('new Set(["OIDC_CLIENT_ID","OIDC_ISSUER_URI","OIDC_USE_MOCK"])') ||
            /new Set\(\[\s*"OIDC_CLIENT_ID",\s*"OIDC_ISSUER_URI",\s*"OIDC_USE_MOCK"\s*\]/.test(code)
    );
    assert.ok(manifest, "The deployed server contains the complete static manifest");
    const provider = chunks.find(({ code }) => code.includes('name: "fetchServerEnvVariableValues"'));
    assert.ok(provider);
    assert.equal(
        chunks.filter(({ code }) => code.includes('name: "fetchServerEnvVariableValues"')).length,
        1,
        "Only the newly built adapter is included"
    );
    const functionId = provider.code.match(/id: "([a-f0-9]+)"/)?.[1];
    assert.ok(functionId);
    const env = {
        OIDC_USE_MOCK: "true",
        OIDC_ISSUER_URI: "https://runtime.example",
        OIDC_CLIENT_ID: "runtime-client",
        OIDC_SPA_TEST_SECRET: "must-not-leak"
    };
    for (const [name, value] of Object.entries(env)) {
        const previous = process.env[name];
        process.env[name] = value;
        t.after(() =>
            previous === undefined ? delete process.env[name] : (process.env[name] = previous)
        );
    }
    const { default: server } = await import(
        pathToFileURL(path.join(root, ".output/server/_ssr/ssr.mjs")).href
    );
    const getEnv = async () => {
        const url = new URL(
            `http://localhost/_serverFn/${functionId}?envVarNames=OIDC_SPA_TEST_SECRET&envVarNames=PATH`
        );
        return server.fetch(
            new Request(url, {
                headers: {
                    Accept: "application/json",
                    "Sec-Fetch-Site": "same-origin",
                    "x-tsr-serverfn": "true"
                }
            })
        );
    };
    // This is the first request to the deployed server: no page render or bootstrap
    // request has initialized an authorization list in this process.
    const firstResponse = await getEnv();
    assert.equal(firstResponse.status, 200);
    const firstBody = await firstResponse.text();
    assert.match(firstBody, /runtime-client/);
    assert.match(firstBody, /https:\/\/runtime\.example/);
    assert.match(firstBody, /OIDC_USE_MOCK/);
    assert.doesNotMatch(firstBody, /must-not-leak|OIDC_SPA_TEST_SECRET|"PATH"/);
    delete process.env.OIDC_ISSUER_URI;
    process.env.OIDC_CLIENT_ID = "";
    const missingValueResponse = await getEnv();
    assert.equal(missingValueResponse.status, 200);
    const missingValueBody = await missingValueResponse.text();
    assert.match(missingValueBody, /OIDC_CLIENT_ID/);
    assert.doesNotMatch(missingValueBody, /runtime-client|runtime\.example/);

    // Native ESM loading (used by vite dev) must work without the config bundler
    // accidentally masking CommonJS default-export interop problems.
    const { babelTraverse, babelGenerate } = await import(
        pathToFileURL(path.join(root, "node_modules/oidc-spa/esm/vendor/build-runtime/babel.mjs")).href
    );
    assert.equal(typeof babelTraverse, "function");
    assert.equal(typeof babelGenerate, "function");
});
