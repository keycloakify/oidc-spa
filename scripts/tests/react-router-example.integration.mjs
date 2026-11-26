import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { createServer as createSocket } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const example = join(repository, "examples/react-router-framework");
const { createTRPCClient, httpBatchLink } = createRequire(join(example, "package.json"))("@trpc/client");

async function freePort() {
    const server = createSocket();
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}

async function start(root, production) {
    const port = await freePort();
    const child = spawn(
        process.execPath,
        production
            ? [
                  "--env-file=.env",
                  join(example, "node_modules/@react-router/serve/bin.cjs"),
                  "build/server/index.js"
              ]
            : [join(example, "node_modules/@react-router/dev/bin.cjs"), "dev", "--port", String(port)],
        {
            cwd: root,
            env: {
                ...process.env,
                NODE_ENV: production ? "production" : "development",
                VITE_OIDC_PROVIDER: "mock",
                HOST: "127.0.0.1",
                PORT: String(port)
            },
            stdio: ["ignore", "pipe", "pipe"]
        }
    );
    let logs = "";
    child.stdout.on("data", data => {
        logs += data;
    });
    child.stderr.on("data", data => {
        logs += data;
    });
    const origin = `http://127.0.0.1:${port}`;
    const stop = async () => {
        if (child.exitCode !== null) return;
        const exited = new Promise(resolve => child.once("exit", resolve));
        child.kill("SIGTERM");
        await exited;
    };
    for (let i = 0; i < 150; i++) {
        if (child.exitCode !== null) throw new Error(logs);
        try {
            const response = await fetch(origin, { headers: { Accept: "text/html" } });
            if (response.status !== 200) {
                await response.body?.cancel();
                throw new Error(`Server returned ${response.status}\n${logs}`);
            }
            await response.body?.cancel();
            return { origin, stop };
        } catch (error) {
            if (error.message.startsWith("Server returned")) {
                await stop();
                throw error;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    await stop();
    throw new Error(logs);
}

async function exercise(origin, label) {
    const headers = { Authorization: "Bearer mock-access-token" };
    const request = (path, options) => fetch(origin + path, { redirect: "manual", ...options });
    for (const path of ["/api/todos", "/todo-list.data"]) {
        assert.equal((await request(path)).status, 401, path);
    }
    let response = await request("/api/todos", { headers: { ...headers, Accept: "text/html" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.ok(Array.isArray(await response.json()));
    const post = name =>
        request("/api/todos", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });
    response = await post(`${label} API WRITE`);
    assert.equal(response.status, 201);
    assert.equal((await post(" ")).status, 400);
    assert.equal((await request("/api/todos", { method: "PUT", headers })).status, 405);
    const head = await request("/api/todos", { method: "HEAD", headers });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    const trpc = createTRPCClient({
        links: [httpBatchLink({ url: origin + "/api/trpc", headers: () => headers })]
    });
    await trpc.todos.add.mutate(`${label} TRPC WRITE`);
    const batches = await Promise.all([trpc.todos.list.query(), trpc.todos.list.query()]);
    for (const todos of batches) {
        assert.ok(todos.some(todo => todo.name === `${label} API WRITE`));
        assert.ok(todos.some(todo => todo.name === `${label} TRPC WRITE`));
    }
    const anonymous = createTRPCClient({ links: [httpBatchLink({ url: origin + "/api/trpc" })] });
    await assert.rejects(anonymous.todos.list.query(), error => error.data?.code === "UNAUTHORIZED");
    response = await request("/todo-list.data", {
        method: "POST",
        headers: { ...headers, Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ todo: `${label} NATIVE WRITE` })
    });
    assert.equal(response.status, 200, await response.clone().text());
    const native = await request("/todo-list.data", { headers });
    assert.equal(native.status, 200);
    const serialized = await native.text();
    assert.ok(serialized.includes(`${label} API WRITE`));
    assert.ok(serialized.includes(`${label} TRPC WRITE`));
    const todos = await (await request("/api/todos", { headers })).json();
    assert.ok(todos.some(todo => todo.name === `${label} NATIVE WRITE`));
    const admin = await request("/todo-list-admin.data", { headers });
    assert.equal(admin.status, 200);
    assert.match(await admin.text(), /mock-user-id/);
}

test(
    "Framework example: native, JSON and tRPC transports share authentication and data",
    { timeout: 120_000 },
    async t => {
        const root = await mkdtemp(join(tmpdir(), "oidc-rr-three-"));
        t.after(() => rm(root, { recursive: true, force: true }));
        for (const name of [
            "app",
            "public",
            "api",
            "package.json",
            "tsconfig.json",
            "react-router.config.ts"
        ]) {
            await cp(join(example, name), join(root, name), { recursive: true });
        }
        await writeFile(join(root, ".env"), "VITE_OIDC_PROVIDER=mock\n");
        await mkdir(join(root, "node_modules"));
        for (const name of await readdir(join(example, "node_modules"))) {
            if (name.startsWith(".") || name === "oidc-spa") continue;
            await symlink(join(example, "node_modules", name), join(root, "node_modules", name));
        }
        await cp(join(repository, "dist"), join(root, "node_modules/oidc-spa"), { recursive: true });
        await writeFile(
            join(root, "vite.config.ts"),
            `import {defineConfig} from 'vite';import {reactRouter} from '@react-router/dev/vite';import {oidcSpa} from 'oidc-spa/vite-plugin';export default defineConfig({server:{host:'127.0.0.1',fs:{allow:[${JSON.stringify(
                root
            )},${JSON.stringify(
                example
            )}]}},plugins:[reactRouter(),oidcSpa({browserRuntimeFreeze:{enabled:true},DPoP:{enabled:true,mode:'auto'}})],resolve:{tsconfigPaths:true}});`
        );
        await t.test("development resource routes and native data requests", async () => {
            const server = await start(root, false);
            try {
                await exercise(server.origin, "DEV");
                for (const path of [
                    "/todo-list",
                    "/todo-list-api",
                    "/todo-list-trpc",
                    "/openid-callback/"
                ]) {
                    const response = await fetch(server.origin + path, {
                        redirect: "manual",
                        headers: { Accept: "text/html" }
                    });
                    assert.equal(response.status, 200, path);
                    assert.match(await response.text(), /application\/x-oidc-spa-pending/);
                }
            } finally {
                await server.stop();
            }
        });
        await promisify(execFile)(
            process.execPath,
            [join(example, "node_modules/@react-router/dev/bin.cjs"), "build"],
            {
                cwd: root,
                env: { ...process.env, NODE_ENV: "production", VITE_OIDC_PROVIDER: "mock" },
                maxBuffer: 10_000_000
            }
        );
        await t.test("built-in react-router-serve, static UI and resource APIs", async () => {
            const server = await start(root, true);
            try {
                await exercise(server.origin, "NODE");
                const html = await readFile(join(root, "build/client/index.html"), "utf8");
                for (const path of [
                    "/",
                    "/todo-list",
                    "/todo-list-api",
                    "/todo-list-trpc",
                    "/todo-list-admin",
                    "/account",
                    "/openid-callback/"
                ]) {
                    const response = await fetch(server.origin + path, { redirect: "manual" });
                    assert.equal(response.status, 200, path);
                    assert.equal(response.headers.get("location"), null);
                    assert.equal(
                        await response.text(),
                        html,
                        "page requests return the build-time document verbatim"
                    );
                }
                const head = await fetch(server.origin + "/todo-list", { method: "HEAD" });
                assert.equal(head.status, 200);
                assert.equal(await head.text(), "");
                const bootstrap = html.match(/src="([^"]*oidc-spa-bootstrap[^"]*)"/)[1];
                const asset = await fetch(server.origin + bootstrap);
                assert.equal(asset.status, 200);
                assert.match(asset.headers.get("Cache-Control"), /immutable/);
                await asset.body.cancel();
                assert.equal((await fetch(server.origin + "/assets/missing.js")).status, 404);
                assert.equal((await fetch(server.origin + "/api/missing")).status, 404);
            } finally {
                await server.stop();
            }
        });
        await t.test(
            "Vercel function preserves resource paths, data requests and request bodies",
            async () => {
                const previous = process.env.VITE_OIDC_PROVIDER;
                process.env.VITE_OIDC_PROVIDER = "mock";
                const cwd = process.cwd();
                process.chdir(root);
                const { default: listener } = await import(pathToFileURL(join(root, "api/index.js")));
                const server = createServer(listener);
                await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
                try {
                    await exercise(`http://127.0.0.1:${server.address().port}`, "VERCEL");
                } finally {
                    await new Promise(resolve => server.close(resolve));
                    process.chdir(cwd);
                    if (previous === undefined) delete process.env.VITE_OIDC_PROVIDER;
                    else process.env.VITE_OIDC_PROVIDER = previous;
                }
            }
        );
    }
);
