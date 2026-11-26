import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "node:net";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const example = join(repository, "examples/tanstack-start");
const json = async path => JSON.parse(await readFile(path, "utf8"));

test(
    "Cloudflare and Netlify builds emit neutral shells and retain working backends",
    { timeout: 120_000 },
    async t => {
        const root = await mkdtemp(join(tmpdir(), "oidc-spa-platform-build-"));
        t.after(() => rm(root, { recursive: true, force: true }));
        for (const name of ["src", "public", "package.json", "tsconfig.json", ".env"]) {
            await cp(join(example, name), join(root, name), { recursive: true });
        }
        await mkdir(join(root, "node_modules"));
        for (const name of await readdir(join(example, "node_modules"))) {
            if ((name.startsWith(".") && name !== ".bin") || name === "oidc-spa") continue;
            await symlink(join(example, "node_modules", name), join(root, "node_modules", name));
        }
        await cp(join(repository, "dist"), join(root, "node_modules/oidc-spa"), { recursive: true });
        await writeFile(
            join(root, "src/routes/api/probe.ts"),
            `
        import { createFileRoute } from "@tanstack/react-router";
        export const Route = createFileRoute("/api/probe")({ server: { handlers: {
            GET: () => Response.json({ api: "working" }),
            POST: () => Response.json({ api: "working" })
        } } });
    `
        );
        await writeFile(
            join(root, "src/routes/_app/probe.tsx"),
            `
        import { createFileRoute } from "@tanstack/react-router";
        import { createServerFn } from "@tanstack/react-start";
        const probe = createServerFn({ method: "GET" }).handler(async () => ({ serverFunction: "working" }));
        export const Route = createFileRoute("/_app/probe")({ loader: () => probe(), component: () => <h1>PROBE PAGE</h1> });
    `
        );

        for (const [preset, base] of [
            ["cloudflare-module", "/"],
            ["netlify", "/"],
            ["cloudflare-module", "/dashboard/"],
            ["netlify", "/dashboard/"]
        ]) {
            const projectRoot =
                base === "/" ? root : await mkdtemp(join(tmpdir(), "oidc-spa-base-build-"));
            if (base !== "/") {
                t.after(() => rm(projectRoot, { recursive: true, force: true }));
                for (const name of [
                    "src",
                    "public",
                    "package.json",
                    "tsconfig.json",
                    ".env",
                    "node_modules"
                ]) {
                    await cp(join(root, name), join(projectRoot, name), { recursive: true });
                }
            }
            await t.test(`${preset} ${base}`, async t => {
                const root = projectRoot;
                const build = async spa => {
                    await writeFile(
                        join(root, "vite.config.ts"),
                        `
                    import { defineConfig } from "vite";
                    import { tanstackStart } from "@tanstack/react-start/plugin/vite";
                    import react from "@vitejs/plugin-react";
                    import { nitro } from "nitro/vite";
                    import { oidcSpa } from "oidc-spa/vite-plugin";
                    export default defineConfig({ base: ${JSON.stringify(
                        base
                    )}, resolve: { tsconfigPaths: true }, plugins: [
                        tanstackStart({ prerender: { enabled: ${spa} }, spa: { enabled: ${spa}, maskPath: "/?__spa_shell" } }),
                        nitro({ preset: ${JSON.stringify(preset)} }), react(), oidcSpa()
                    ] });
                `
                    );
                    try {
                        await promisify(execFile)(
                            process.execPath,
                            [join(example, "node_modules/vite/bin/vite.js"), "build"],
                            {
                                cwd: root,
                                env: {
                                    ...process.env,
                                    OIDC_PROVIDER: "mock",
                                    WRANGLER_SEND_METRICS: "false"
                                },
                                maxBuffer: 10_000_000
                            }
                        );
                    } catch (error) {
                        throw new Error(
                            `${preset} (spa=${spa}) failed:\n${error.stdout}\n${error.stderr}`,
                            { cause: error }
                        );
                    }
                };
                await build(true);
                const cloudflare = preset === "cloudflare-module";
                const output = cloudflare
                    ? join(root, ".output")
                    : join(root, ".netlify/functions-internal");
                const publicDir = cloudflare ? join(output, "public") : join(root, "dist");
                const serverDir = join(output, "server");
                assert.match(
                    await readFile(
                        join(
                            publicDir,
                            base,
                            cloudflare && base === "/" ? "_prerendered-index.html" : "index.html"
                        ),
                        "utf8"
                    ),
                    /<h1>/
                );
                const shell = await readFile(join(publicDir, base, "_shell.html"), "utf8");
                assert(
                    !shell.includes("<h1>"),
                    `${preset}: callback shell must contain no home-page UI`
                );
                const probeChunk = (await readdir(join(serverDir, "_ssr"))).find(name =>
                    /^probe-.*\.mjs$/.test(name)
                );
                const source = await readFile(join(serverDir, "_ssr", probeChunk), "utf8");
                const fnId = source.match(/id: "([a-f0-9]+)"/)[1];
                let request;
                let stop = () => {};
                if (cloudflare) {
                    const config = await json(join(serverDir, "wrangler.json"));
                    assert.equal(config.main, "index.mjs");
                    assert(!config.vars?.TSS_PRERENDERING);
                    await assert.rejects(readFile(join(serverDir, ".dev.vars")), { code: "ENOENT" });
                    const socket = createServer();
                    await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
                    const port = socket.address().port;
                    await new Promise(resolve => socket.close(resolve));
                    const child = spawn(
                        process.execPath,
                        [
                            join(example, "node_modules/wrangler/bin/wrangler.js"),
                            "dev",
                            "--config",
                            join(serverDir, "wrangler.json"),
                            "--port",
                            String(port),
                            "--ip",
                            "127.0.0.1"
                        ],
                        {
                            cwd: root,
                            env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
                            stdio: ["ignore", "pipe", "pipe"]
                        }
                    );
                    let logs = "";
                    child.stdout.on("data", chunk => {
                        logs += chunk;
                    });
                    child.stderr.on("data", chunk => {
                        logs += chunk;
                    });
                    stop = async () => {
                        if (child.exitCode !== null) return;
                        const exited = new Promise(resolve => child.once("exit", resolve));
                        child.kill("SIGTERM");
                        await exited;
                    };
                    t.after(stop);
                    request = (path, init) =>
                        fetch(`http://127.0.0.1:${port}${base}${path.replace(/^\//, "")}`, init);
                    let ready = false;
                    for (let i = 0; i < 100; i++) {
                        try {
                            await request("/");
                            ready = true;
                            break;
                        } catch {}
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    assert(ready, logs);
                    for (const path of [
                        `/openid-callback/?state=b2lkYy1zcGEu${"a".repeat(20)}&code=123`,
                        "/unknown-page"
                    ]) {
                        const response = await request(path, {
                            headers: { "sec-fetch-mode": "navigate" }
                        });
                        assert.equal(response.status, 200);
                        assert.equal(await response.text(), shell);
                    }
                    assert.match(await (await request("/?state=unrelated")).text(), /<h1>/);
                    assert.match(await (await request("/probe")).text(), /PROBE PAGE/);
                    // Native Cloudflare SPA fallback applies to missing asset URLs too.
                    const missingAsset = await request("/assets/missing.js");
                    assert.equal(missingAsset.status, 200);
                    assert.equal(await missingAsset.text(), shell);
                } else {
                    const entry = await import(pathToFileURL(join(serverDir, "server.mjs")));
                    assert.deepEqual(
                        entry.config.path,
                        ["api", "api/*", "_serverFn", "_serverFn/*"].map(path => base + path)
                    );
                    request = (path, init) =>
                        entry.default(
                            new Request(`https://example.com${base}${path.replace(/^\//, "")}`, init),
                            {}
                        );
                    assert(
                        (await readFile(join(publicDir, "_redirects"), "utf8")).includes(
                            `${base}* ${base}_shell.html 200`
                        )
                    );
                }
                for (const method of ["GET", "POST"]) {
                    assert.deepEqual(await (await request("/api/probe", { method })).json(), {
                        api: "working"
                    });
                }
                const fnResponse = await request(`/_serverFn/${fnId}`, {
                    headers: { "x-tsr-serverfn": "true", "sec-fetch-site": "same-origin" }
                });
                assert.equal(fnResponse.status, 200);
                assert.match(await fnResponse.text(), /serverFunction.*working/);
                await stop();

                await build(false);
                await assert.rejects(readFile(join(publicDir, base, "_shell.html")), { code: "ENOENT" });
                if (cloudflare) {
                    assert.equal((await json(join(serverDir, "wrangler.json"))).main, "index.mjs");
                } else {
                    await assert.rejects(
                        readFile(join(root, ".netlify/edge-functions/oidc-spa-callback.js")),
                        { code: "ENOENT" }
                    );
                    assert(
                        !(await readFile(join(publicDir, "_redirects"), "utf8")).includes("_shell.html")
                    );
                }
            });
        }
    }
);
