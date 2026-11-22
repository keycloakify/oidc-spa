import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createTanstackStartNitroOutput } from "../../dist/esm/vite-plugin/tanstack-start/nitroOutput.mjs";

const state = "b2lkYy1zcGEu" + "a".repeat(20);
const json = async path => JSON.parse(await readFile(path, "utf8"));

async function fixture(t, preset, { shell = true, modern = false } = {}) {
    const root = await mkdtemp(join(tmpdir(), "oidc-spa-platform-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const dir =
        preset === "netlify"
            ? join(root, modern ? ".netlify/v1/functions" : ".netlify/functions-internal")
            : join(root, ".output");
    const output = { dir, serverDir: join(dir, "server"), publicDir: join(root, "public") };
    await mkdir(output.serverDir, { recursive: true });
    await mkdir(output.publicDir);
    if (shell) await writeFile(join(output.publicDir, "_shell.html"), "SHELL");
    const { plugin, nitroModule } = createTanstackStartNitroOutput({ isTanstackStart: () => true });
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

test("Cloudflare dispatcher serves static files and callbacks without running SSR", async t => {
    const f = await fixture(t, "cloudflare-module");
    const configPath = join(f.output.serverDir, "wrangler.json");
    const original = {
        main: "index.mjs",
        assets: { binding: "FILES", directory: "../public", run_worker_first: ["/custom"] },
        vars: { EXAMPLE: "preserved" }
    };
    await writeFile(configPath, JSON.stringify(original));
    await writeFile(
        join(f.output.serverDir, "index.mjs"),
        `
        export const scheduled = "preserved";
        export default { scheduled: "preserved", fetch(request) {
            return new Response("BACKEND " + request.method + " " + new URL(request.url).pathname);
        } };
    `
    );
    await f.compiled();
    assert.match(f.commands.preview, /--var TSS_PRERENDERING:true/);
    await writeFile(join(f.output.dir, "nitro.json"), JSON.stringify({ commands: f.commands }));
    await f.build();
    assert.equal((await json(join(f.output.dir, "nitro.json"))).commands.preview, "npx wrangler dev");
    const config = await json(configPath);
    assert.equal(config.main, "oidc-spa-worker.mjs");
    assert.equal(config.assets.not_found_handling, "none");
    assert.deepEqual(config.vars, original.vars);
    assert(config.assets.run_worker_first.includes("/"));
    assert(config.assets.run_worker_first.includes("/custom"));
    assert(config.assets.run_worker_first.includes("/api/*"));
    await f.build();
    assert.deepEqual(await json(configPath), config);
    const { default: worker, scheduled } = await import(
        pathToFileURL(join(f.output.serverDir, config.main))
    );
    assert.equal(scheduled, "preserved");
    assert.equal(worker.scheduled, "preserved");
    const assetRequests = [];
    const env = {
        FILES: {
            async fetch(request) {
                const url = new URL(request.url);
                assetRequests.push(url);
                if (url.pathname === "/_shell.html") return Response.redirect(new URL("/_shell", url));
                const files = {
                    "/": "HOME",
                    "/page1": "PAGE1",
                    "/assets/app.js": "ASSET",
                    "/_shell": "SHELL"
                };
                return new Response(files[url.pathname] ?? "MISSING", {
                    status: files[url.pathname] ? 200 : 404
                });
            }
        }
    };
    for (const method of ["GET", "HEAD"]) {
        for (const [path, expected] of [
            ["/", "HOME"],
            ["/?state=unrelated", "HOME"],
            ["/?state=", "HOME"],
            [`/?state=${state}&code=123&extra=provider`, "SHELL"],
            ["/page1", "PAGE1"],
            [`/page1?state=${state}`, "PAGE1"],
            ["/assets/app.js", "ASSET"],
            ["/unknown", "SHELL"],
            ["/apiary", "SHELL"]
        ]) {
            const response = await worker.fetch(
                new Request(`https://example.com${path}`, { method }),
                env,
                {}
            );
            assert.equal(await response.text(), expected, `${method} ${path}`);
        }
    }
    const before = assetRequests.length;
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
        for (const path of ["/api", "/api/todos", "/_serverFn", "/_serverFn/test"]) {
            const response = await worker.fetch(
                new Request(`https://example.com${path}`, { method }),
                env,
                {}
            );
            assert.equal(await response.text(), `BACKEND ${method} ${path}`);
        }
    }
    assert.equal(assetRequests.length, before, "backend requests bypass static handling");
    for (const url of assetRequests.filter(url => url.pathname.startsWith("/_shell"))) {
        assert.equal(url.search, "", "callback credentials must not be forwarded to shell asset URLs");
    }
});

for (const modern of [false, true]) {
    test(`Netlify ${
        modern ? "Frameworks API" : "legacy"
    } routing preserves static pages and dynamic endpoints`, async t => {
        const f = await fixture(t, "netlify", { modern });
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
        await f.build();
        const entry = await import(pathToFileURL(join(f.output.serverDir, "server.mjs")));
        assert.deepEqual(entry.config.path, ["/api", "/api/*", "/_serverFn", "/_serverFn/*"]);
        assert.equal(entry.config.preferStatic, true);
        assert.deepEqual(entry.config.excludedPath, ["/assets/*"]);
        assert.equal(await (await entry.default()).text(), "BACKEND");
        const redirects = await readFile(join(f.output.publicDir, "_redirects"), "utf8");
        assert.equal(redirects, "/old /new 301\n/* /_shell.html 200\n");
        const edgeDir = join(f.output.dir, "../edge-functions");
        const source = await readFile(join(edgeDir, "oidc-spa-callback.js"), "utf8");
        const callback = await import(
            `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
        );
        for (const method of ["GET", "HEAD"]) {
            const result = callback.default(
                new Request(`https://example.com/?state=${state}&code=123&extra=456`, { method })
            );
            assert.equal(result.href, "https://example.com/_shell.html");
            for (const path of ["/", "/?state=other", `/page1?state=${state}`, `/api?state=${state}`]) {
                assert.equal(
                    callback.default(new Request(`https://example.com${path}`, { method })),
                    undefined
                );
            }
        }
        assert.equal(
            callback.default(new Request(`https://example.com/?state=${state}`, { method: "POST" })),
            undefined
        );
        await f.build();
        assert.equal(await readFile(join(f.output.publicDir, "_redirects"), "utf8"), redirects);
        if (!modern) {
            const manifest = await json(join(edgeDir, "manifest.json"));
            assert.deepEqual(manifest.functions, [{ function: "oidc-spa-callback", path: "/" }]);
            manifest.functions.push({ function: "user-function", path: "/other" });
            await writeFile(join(edgeDir, "manifest.json"), JSON.stringify(manifest));
        }
        // Rebuilding without a shell must remove our separate edge output only.
        await rm(join(f.output.publicDir, "_shell.html"));
        await f.build();
        await assert.rejects(readFile(join(edgeDir, "oidc-spa-callback.js")), { code: "ENOENT" });
        if (!modern) {
            assert.deepEqual((await json(join(edgeDir, "manifest.json"))).functions, [
                { function: "user-function", path: "/other" }
            ]);
        }
    });
}

test("Cloudflare without a shell leaves the generated deployment untouched", async t => {
    const f = await fixture(t, "cloudflare-module", { shell: false });
    await f.build();
    await assert.rejects(readFile(join(f.output.serverDir, "oidc-spa-worker.mjs")), { code: "ENOENT" });
});
