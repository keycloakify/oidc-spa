import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createTanstackStartNitroOutput } from "../../dist/esm/vite-plugin/tanstack-start/nitroOutput.mjs";

const json = async path => JSON.parse(await readFile(path, "utf8"));
const shell = "<!doctype html><html><head></head><body>SHELL</body></html>";
const home = shell.replace("SHELL", "HOME");

async function fixture(t, preset, { spa = true, modern = false, base = "/", legacy = false } = {}) {
    const root = await mkdtemp(join(tmpdir(), "oidc-spa-platform-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const dir =
        preset === "netlify"
            ? join(root, modern ? ".netlify/v1/functions" : ".netlify/functions-internal")
            : join(root, ".output");
    const output = { dir, serverDir: join(dir, "server"), publicDir: join(root, "public") };
    await mkdir(output.serverDir, { recursive: true });
    await mkdir(output.publicDir);
    if (spa) await writeFile(join(output.publicDir, "_shell.html"), shell);
    await writeFile(join(output.publicDir, "index.html"), home);
    const { plugin, nitroModule } = createTanstackStartNitroOutput({
        isTanstackStart: () => true,
        useLegacyRedirectUri: legacy
    });
    plugin.configResolved({ base });
    let compiled;
    const commands = { preview: "npx wrangler dev" };
    nitroModule.setup({
        options: { preset, dev: false, output, commands },
        hooks: {
            hook(name, callback) {
                compiled = callback;
            }
        }
    });
    return {
        root,
        output,
        commands,
        compiled: () => compiled(),
        build: () => plugin.buildApp.handler()
    };
}

for (const base of ["/", "/dashboard/"]) {
    test(`Node server prepares static SPA documents without changing backend output: ${base}`, async t => {
        const f = await fixture(t, "node-server", { base });
        await mkdir(join(f.output.publicDir, "pricing"));
        await mkdir(join(f.output.publicDir, "assets"));
        await writeFile(join(f.output.publicDir, "pricing/index.html"), home.replace("HOME", "PRICING"));
        const asset = 'console.log("APP");';
        const backend = 'export default () => new Response("BACKEND");';
        await writeFile(join(f.output.publicDir, "assets/app.js"), asset);
        await writeFile(join(f.output.serverDir, "index.mjs"), backend);
        await f.build();
        const markedShell = shell.replace("<html>", "<html data-oidc-spa-static>");
        assert.equal(await readFile(join(f.output.publicDir, base, "_shell.html"), "utf8"), markedShell);
        for (const [path, content] of [
            ["index.html", "HOME"],
            ["pricing/index.html", "PRICING"]
        ]) {
            assert.equal(
                await readFile(join(f.output.publicDir, base, path), "utf8"),
                markedShell.replace("SHELL", content)
            );
        }
        assert.equal(await readFile(join(f.output.publicDir, base, "assets/app.js"), "utf8"), asset);
        assert.equal(await readFile(join(f.output.serverDir, "index.mjs"), "utf8"), backend);
        await f.build();
        assert.equal(await readFile(join(f.output.publicDir, base, "_shell.html"), "utf8"), markedShell);
    });

    test(`Cloudflare uses native static SPA routing without a dispatcher: ${base}`, async t => {
        const f = await fixture(t, "cloudflare-module", { base });
        const configPath = join(f.output.serverDir, "wrangler.json");
        const original = {
            main: "index.mjs",
            assets: {
                binding: "FILES",
                directory: "../public",
                run_worker_first: ["/custom"]
            },
            vars: { EXAMPLE: "preserved" }
        };
        await writeFile(configPath, JSON.stringify(original));
        await f.compiled();
        assert.match(f.commands.preview, /--var TSS_PRERENDERING:true/);
        await writeFile(join(f.output.dir, "nitro.json"), JSON.stringify({ commands: f.commands }));
        await f.build();
        assert.equal(
            (await json(join(f.output.dir, "nitro.json"))).commands.preview,
            "npx wrangler dev"
        );
        const config = await json(configPath);
        assert.equal(config.main, original.main);
        assert.equal(config.assets.not_found_handling, "single-page-application");
        assert.deepEqual(config.vars, original.vars);
        assert.deepEqual(config.assets.run_worker_first, [
            "/custom",
            ...["api", "api/*", "_serverFn", "_serverFn/*"].map(path => base + path)
        ]);
        const markedShell = await readFile(join(f.output.publicDir, base, "_shell.html"), "utf8");
        assert.match(markedShell, /<html data-oidc-spa-static>/);
        assert.equal(
            await readFile(join(f.output.publicDir, base, "openid-callback/index.html"), "utf8"),
            markedShell
        );
        assert.equal(await readFile(join(f.output.publicDir, "index.html"), "utf8"), markedShell);
        const homePath = base === "/" ? "_prerendered-index.html" : base + "index.html";
        assert.match(await readFile(join(f.output.publicDir, homePath), "utf8"), /HOME/);
        await assert.rejects(readFile(join(f.output.serverDir, "oidc-spa-worker.mjs")), {
            code: "ENOENT"
        });
        await f.build();
        assert.deepEqual(await json(configPath), config);
        assert.match(await readFile(join(f.output.publicDir, homePath), "utf8"), /HOME/);
    });

    for (const modern of [false, true]) {
        test(`Netlify ${modern ? "Frameworks API" : "legacy"} uses CDN rules: ${base}`, async t => {
            const f = await fixture(t, "netlify", { base, modern });
            await writeFile(
                join(f.output.serverDir, "main.mjs"),
                "export default () => new Response('BACKEND');"
            );
            await writeFile(
                join(f.output.serverDir, "server.mjs"),
                `export { default } from "./main.mjs";
                export const config = { path: "/*", preferStatic: true, excludedPath: ["/assets/*"], generator: "nitro" };`
            );
            await writeFile(join(f.output.publicDir, "_redirects"), "/old /new 301\n");
            const edgeDir = join(f.output.dir, "../edge-functions");
            await mkdir(edgeDir, { recursive: true });
            await writeFile(join(edgeDir, "oidc-spa-callback.js"), "old dispatcher");
            await writeFile(
                join(edgeDir, "manifest.json"),
                JSON.stringify({
                    version: 1,
                    functions: [
                        { function: "oidc-spa-callback", path: "/" },
                        { function: "user-function", path: "/other" }
                    ]
                })
            );
            await f.build();
            const entry = await import(pathToFileURL(join(f.output.serverDir, "server.mjs")));
            assert.deepEqual(
                entry.config.path,
                ["api", "api/*", "_serverFn", "_serverFn/*"].map(path => base + path)
            );
            assert.equal(entry.config.preferStatic, true);
            assert.deepEqual(entry.config.excludedPath, ["/assets/*"]);
            assert.equal(await (await entry.default()).text(), "BACKEND");
            const redirects = await readFile(join(f.output.publicDir, "_redirects"), "utf8");
            assert.equal(
                redirects,
                `${base}openid-callback/ ${base}_shell.html 200!\n/old /new 301\n${base}* ${base}_shell.html 200\n`
            );
            await assert.rejects(readFile(join(edgeDir, "oidc-spa-callback.js")), { code: "ENOENT" });
            assert.deepEqual((await json(join(edgeDir, "manifest.json"))).functions, [
                { function: "user-function", path: "/other" }
            ]);
            await f.build();
            assert.equal(await readFile(join(f.output.publicDir, "_redirects"), "utf8"), redirects);
        });
    }
}

test("Cloudflare SSR without a shell leaves deployment and documents untouched", async t => {
    const f = await fixture(t, "cloudflare-module", { spa: false });
    await f.build();
    assert.equal(await readFile(join(f.output.publicDir, "index.html"), "utf8"), home);
    await assert.rejects(readFile(join(f.output.serverDir, "oidc-spa-worker.mjs")), { code: "ENOENT" });
});

test("Node server SSR without a shell leaves documents untouched", async t => {
    const f = await fixture(t, "node-server", { spa: false, base: "/dashboard/" });
    await f.build();
    assert.equal(await readFile(join(f.output.publicDir, "index.html"), "utf8"), home);
});

for (const preset of ["vercel", "node-server"]) {
    test(`${preset} SPA rejects legacy home callbacks with migration instructions`, async t => {
        const f = await fixture(t, preset, { legacy: true });
        await assert.rejects(f.build(), /useLegacyRedirectUri is not supported.*openid-callback/);
        assert.equal(await readFile(join(f.output.publicDir, "index.html"), "utf8"), home);
    });
}
