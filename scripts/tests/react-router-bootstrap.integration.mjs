import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { createReactRouterFixture } from "./react-router-bootstrap.fixture.mjs";
import { parse } from "../../dist/esm/vendor/build-runtime/parse5.mjs";

const exec = promisify(execFile);
async function freePort() {
    const server = createServer();
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}
function assertProtected(html) {
    const scripts = [];
    const links = [];
    function walk(node) {
        if (node.tagName === "script") scripts.push(node);
        if (node.tagName === "link") links.push(node);
        node.childNodes?.forEach(walk);
    }
    walk(parse(html));
    const executable = scripts.filter(
        s => !s.attrs.some(a => a.name === "type" && a.value === "application/x-oidc-spa-pending")
    );
    assert.equal(executable.length, 1);
    assert(executable[0].attrs.some(a => a.name === "src" && a.value.includes("bootstrap")));
    assert(executable[0].attrs.some(a => a.name === "nonce" && a.value === "fixture-nonce"));
    assert(scripts.filter(s => s.attrs.some(a => a.name === "data-oidc-spa-type")).length >= 4);
    assert(!links.some(link => link.attrs.some(a => a.name === "rel" && a.value === "modulepreload")));
}
for (const apiOnly of [false, true]) {
    test(
        `packaged RR plugin: ${apiOnly ? "API-only" : "SPA"}, custom app directory and base path`,
        { timeout: 120000 },
        async () => {
            const port = await freePort();
            const root = await createReactRouterFixture({ apiOnly, port });
            let child;
            let logs = "";
            try {
                const cli = join(root, "node_modules/@react-router/dev/bin.cjs");
                const build = await exec(process.execPath, [cli, "build"], {
                    cwd: root,
                    env: { ...process.env, NODE_ENV: "production" },
                    maxBuffer: 4 * 1024 * 1024
                });
                assert(!build.stderr.includes("Application code leaked"));
                const html = await readFile(join(root, "build/client/index.html"), "utf8");
                assertProtected(html);
                assert(!html.includes("Root loader requires authentication"));
                const bootstrapPath = html.match(/src="([^"]*oidc-spa-bootstrap[^"]*)"/)[1];
                assert(
                    (
                        await readFile(
                            join(root, "build/client", bootstrapPath.slice("/demo/".length)),
                            "utf8"
                        )
                    ).includes("import")
                );
                // Start with a cold optimizer: no manual optimizeDeps and no document URL rewrite.
                child = spawn(process.execPath, ["--conditions=development", cli, "dev"], {
                    cwd: root,
                    env: { ...process.env, NODE_ENV: "development" },
                    stdio: ["ignore", "pipe", "pipe"]
                });
                child.stdout.on("data", b => {
                    logs += b;
                });
                child.stderr.on("data", b => {
                    logs += b;
                });
                const origin = `http://127.0.0.1:${port}`;
                let response;
                for (let attempt = 0; attempt < 100; attempt++) {
                    if (child.exitCode !== null) throw new Error(logs);
                    try {
                        response = await fetch(origin + "/demo/todo", {
                            headers: { Accept: "text/html" }
                        });
                        break;
                    } catch {}
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                assert(response, logs);
                assert.equal(response.status, 200, await response.clone().text());
                assertProtected(await response.text());
                assert.match(response.headers.get("Content-Security-Policy"), /nonce-fixture-nonce/);
                assert.equal(response.headers.getSetCookie().length, 2);
                if (apiOnly) {
                    for (const path of ["/demo/no-such-route", "/demo/users/@me"]) {
                        const shell = await fetch(origin + path, { headers: { Accept: "text/html" } });
                        assert.equal(shell.status, 200);
                        assertProtected(await shell.text());
                    }
                }
                const head = await fetch(origin + "/demo/todo", {
                    method: "HEAD",
                    headers: { Accept: "text/html" }
                });
                assert.equal(head.status, 200);
                assert.equal(await head.text(), "");
                const callback = await fetch(
                    origin + "/demo/todo?code=fixture&state=b2lkYy1zcGEu" + "x".repeat(20),
                    { headers: { Accept: "text/html" } }
                );
                assert.equal(callback.status, 200);
                assertProtected(await callback.text());
                if (apiOnly) {
                    const missing = await fetch(origin + "/demo/todo.data");
                    assert.equal(missing.status, 401);
                    // Even Accept:text/html must not divert an API request to the shell.
                    const missingHtml = await fetch(origin + "/demo/todo.data", {
                        headers: { Accept: "text/html" }
                    });
                    assert.equal(missingHtml.status, 401);
                    const data = await fetch(origin + "/demo/todo.data", {
                        headers: { Authorization: "Bearer fixture" }
                    });
                    assert.equal(data.status, 200);
                    assert.match(await data.text(), /authenticated todo data/);
                    const action = await fetch(origin + "/demo/todo.data", {
                        method: "POST",
                        headers: { Authorization: "Bearer fixture" },
                        body: new URLSearchParams({ todo: "native mutation" })
                    });
                    assert.equal(action.status, 200);
                    assert.match(await action.text(), /native mutation/);
                    const blocked = await fetch(origin + "/demo/todo.data", {
                        method: "POST",
                        body: new URLSearchParams({ todo: "unauthorized" })
                    });
                    assert.equal(blocked.status, 401);
                }
                const harness = await fetch(origin + "/demo/callback-harness.html");
                assert.equal(harness.status, 200);
                assert.match(await harness.text(), /Callback iframe test/);
                assert(!logs.includes("emitFile() is not supported"), logs);
                assert(!logs.includes("optimized dependencies changed"), logs);
                child.kill("SIGTERM");
                await new Promise(resolve => child.once("exit", resolve));
                child = spawn(process.execPath, ["serve.mjs"], {
                    cwd: root,
                    env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
                    stdio: ["ignore", "pipe", "pipe"]
                });
                child.stdout.on("data", b => {
                    logs += b;
                });
                child.stderr.on("data", b => {
                    logs += b;
                });
                let production;
                for (let attempt = 0; attempt < 100; attempt++) {
                    if (child.exitCode !== null) throw new Error(logs);
                    try {
                        production = await fetch(origin + "/demo/todo");
                        break;
                    } catch {}
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                assert(production, logs);
                assert.equal(production.status, 200);
                assertProtected(await production.text());
                assert.match(production.headers.get("Content-Security-Policy"), /nonce-fixture-nonce/);
                if (apiOnly) {
                    const blocked = await fetch(origin + "/demo/todo.data", {
                        headers: { "X-React-Router-SPA-Mode": "yes" }
                    });
                    assert.equal(blocked.status, 401);
                    const data = await fetch(origin + "/demo/todo.data", {
                        headers: { Authorization: "Bearer fixture" }
                    });
                    assert.equal(data.status, 200);
                    assert.match(await data.text(), /authenticated root data/);
                    const mutation = await fetch(origin + "/demo/todo.data", {
                        method: "POST",
                        headers: { Authorization: "Bearer fixture" },
                        body: new URLSearchParams({ todo: "production mutation" })
                    });
                    assert.equal(mutation.status, 200);
                    assert.match(await mutation.text(), /production mutation/);
                }
            } finally {
                if (child && child.exitCode === null) {
                    child.kill("SIGTERM");
                    await new Promise(resolve => child.once("exit", resolve));
                }
                await rm(root, { recursive: true, force: true });
            }
        }
    );
}

test("plain Vite keeps its existing entrypoint integration", { timeout: 60000 }, async () => {
    const root = await createReactRouterFixture({ apiOnly: false, base: "/" });
    try {
        await import("node:fs/promises").then(({ writeFile }) =>
            Promise.all([
                writeFile(
                    join(root, "vite.config.ts"),
                    `import {defineConfig} from "vite";import {oidcSpa} from "oidc-spa/vite-plugin";export default defineConfig({plugins:[oidcSpa()]});`
                ),
                writeFile(
                    join(root, "index.html"),
                    `<!doctype html><html><head></head><body><script type="module" src="/main.ts"></script></body></html>`
                ),
                writeFile(join(root, "main.ts"), `console.log("vanilla app");`)
            ])
        );
        await exec(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "build"], {
            cwd: root,
            maxBuffer: 4 * 1024 * 1024
        });
        const html = await readFile(join(root, "dist/index.html"), "utf8");
        assert(!html.includes("oidc-spa-pending"));
        assert(!html.includes("react-router-bootstrap"));
        assert.match(html, /<script type="module"[^>]*src=/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test(
    "unsafe manual chunking fails rather than evaluating application code in the bootstrap",
    { timeout: 60000 },
    async () => {
        const root = await createReactRouterFixture({ apiOnly: false });
        try {
            const { writeFile } = await import("node:fs/promises");
            const config = await readFile(join(root, "vite.config.ts"), "utf8");
            await writeFile(
                join(root, "vite.config.ts"),
                config.replace(
                    "server:",
                    `build:{rollupOptions:{output:{manualChunks:()=>"unsafe"}}},server:`
                )
            );
            await assert.rejects(
                exec(process.execPath, [join(root, "node_modules/@react-router/dev/bin.cjs"), "build"], {
                    cwd: root,
                    maxBuffer: 4 * 1024 * 1024
                }),
                error =>
                    String(error.stderr).includes(
                        "Application code leaked into the React Router security bootstrap"
                    )
            );
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }
);
