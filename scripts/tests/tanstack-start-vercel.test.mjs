import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTanstackStartNitroOutput } from "../../dist/esm/vite-plugin/tanstack-start/nitroOutput.mjs";

async function fixture(
    t,
    { preset = "vercel", shell = true, base = "/", legacy = false, tanstack = true, dev = false } = {}
) {
    const dir = await mkdtemp(join(tmpdir(), "oidc-spa-vercel-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const publicDir = join(dir, "static");
    await mkdir(publicDir);
    if (shell) await writeFile(join(publicDir, "_shell.html"), "<html><body>SHELL</body></html>");
    await writeFile(join(publicDir, "index.html"), "<html><body>HOME</body></html>");
    const original = {
        version: 3,
        framework: { name: "nitro" },
        overrides: {},
        routes: [
            { src: "/assets/(.*)", headers: { "cache-control": "immutable" } },
            { handle: "filesystem" },
            { src: "/(.*)", dest: "/__server" }
        ]
    };
    const configPath = join(dir, "config.json");
    const originalSource = JSON.stringify(original);
    await writeFile(configPath, originalSource);
    const { nitroModule, plugin } = createTanstackStartNitroOutput({
        isTanstackStart: () => tanstack,
        useLegacyRedirectUri: legacy
    });
    plugin.configResolved({ base });
    nitroModule.setup({ options: { preset, dev, output: { dir, publicDir } }, hooks: { hook() {} } });
    return {
        publicDir,
        original,
        originalSource,
        configPath,
        build: () => plugin.buildApp.handler(),
        read: async () => JSON.parse(await readFile(configPath, "utf8"))
    };
}

// Interpret the emitted routing data independently of the rule generator.
function destination(config, address, method = "GET", base = "/") {
    const url = new URL(address, "https://example.com");
    const assetPath = url.pathname.startsWith(base) ? "/" + url.pathname.slice(base.length) : undefined;
    for (const route of config.routes) {
        if (route.handle === "filesystem") {
            if (!["GET", "HEAD"].includes(method)) continue;
            if (assetPath === "/") return "HOME";
            if (assetPath === "/page1") return "PAGE1";
            if (assetPath === "/assets/app.js") return "ASSET";
            continue;
        }
        if (!new RegExp(route.src).test(url.pathname)) continue;
        if (route.methods && !route.methods.includes(method)) continue;
        if (
            route.has?.some(condition => {
                const value = url.searchParams.get(condition.key);
                return value === null || !value.startsWith(condition.value.pre);
            })
        ) {
            continue;
        }
        if (route.dest) return route.dest;
    }
}

test("Vercel output serves callbacks and SPA fallbacks statically while retaining backend routing", async t => {
    const f = await fixture(t);
    await f.build();
    const config = await f.read();
    assert.deepEqual(
        config.routes.filter(route => route.dest !== "/_shell.html"),
        f.original.routes
    );
    assert.deepEqual({ ...config, routes: f.original.routes }, f.original);
    const state = "b2lkYy1zcGEu" + "a".repeat(20);
    for (const method of ["GET", "HEAD"]) {
        assert.equal(
            destination(config, `/openid-callback/?state=${state}&code=example`, method),
            "/_shell.html"
        );
        assert.equal(destination(config, "/", method), "HOME");
        assert.equal(destination(config, `/?state=${state}&code=example`, method), "HOME");
        assert.equal(destination(config, "/openid-callback/", method), "/_shell.html");
        assert.equal(destination(config, "/?state=unrelated", method), "HOME");
        assert.equal(destination(config, "/?state=", method), "HOME");
        assert.equal(destination(config, "/?state=prefix-b2lkYy1zcGEu", method), "HOME");
        assert.equal(destination(config, `/page1?state=${state}`, method), "PAGE1");
        assert.equal(destination(config, `/api/todos?state=${state}`, method), "/__server");
        assert.equal(destination(config, `/_serverFn/example?state=${state}`, method), "/__server");
        assert.equal(destination(config, "/assets/app.js", method), "ASSET");
        assert.equal(destination(config, "/not-prerendered", method), "/_shell.html");
        assert.equal(destination(config, "/apiary", method), "/_shell.html");
        assert.equal(destination(config, "/_serverFn-other", method), "/_shell.html");
        assert.equal(destination(config, "/api", method), "/__server");
        assert.equal(destination(config, "/_serverFn", method), "/__server");
    }
    for (const method of ["POST", "PUT", "DELETE"]) {
        assert.equal(destination(config, `/?state=${state}`, method), "/_shell.html");
        assert.equal(destination(config, "/api/todos", method), "/__server");
        assert.equal(destination(config, "/_serverFn/example", method), "/__server");
    }
    await f.build();
    assert.deepEqual(await f.read(), config, "repeating the hook must not duplicate the rule");
});

for (const options of [
    { preset: "node-server" },
    { preset: "cloudflare-pages" },
    { shell: false },
    { tanstack: false },
    { dev: true }
]) {
    test(`other builds keep their output unchanged: ${JSON.stringify(options)}`, async t => {
        const f = await fixture(t, options);
        await f.build();
        assert.equal(await readFile(f.configPath, "utf8"), f.originalSource);
    });
}

test("unexpected Vercel output fails explicitly instead of discarding generated configuration", async t => {
    const f = await fixture(t);
    await writeFile(f.configPath, '{"version":3}');
    await assert.rejects(f.build(), /Expected routes in Nitro's Vercel output config/);
    assert.equal(await readFile(f.configPath, "utf8"), '{"version":3}');
});

test("missing filesystem phase fails without writing a broken fallback order", async t => {
    const f = await fixture(t);
    const source = JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/__server" }] });
    await writeFile(f.configPath, source);
    await assert.rejects(f.build(), /Expected filesystem routing/);
    assert.equal(await readFile(f.configPath, "utf8"), source);
});

for (const base of ["/dashboard/", "/team.v1/"]) {
    test(`Vercel mounts static pages, callback and backend paths under ${base}`, async t => {
        const f = await fixture(t, { base });
        await f.build();
        const config = await f.read();
        const route = (path, method = "GET") => destination(config, path, method, base);
        assert.equal(route(base), "HOME");
        assert.equal(route(base + "?state=b2lkYy1zcGEuexample"), "HOME");
        assert.equal(route(base + "openid-callback/?state=anything&code=123"), base + "_shell.html");
        assert.equal(route(base + "openid-callback/#state=anything&code=123"), base + "_shell.html");
        assert.equal(route(base + "missing"), base + "_shell.html");
        assert.equal(route(base + "api/todos"), "/__server");
        assert.equal(route(base + "_serverFn/test", "POST"), "/__server");
        assert.equal(route("/"), "/__server");
        const html = await readFile(join(f.publicDir, base, "index.html"), "utf8");
        assert.match(html, /HOME/);
        assert.match(html, /data-oidc-spa-static/);
        await f.build();
        assert.deepEqual(await f.read(), config);
    });
}
