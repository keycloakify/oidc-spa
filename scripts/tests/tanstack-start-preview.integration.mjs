import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const example = join(repository, "examples/tanstack-start");
async function freePort() {
    const socket = createServer();
    await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    return port;
}

async function startPreview(root) {
    const port = await freePort();
    const child = spawn(
        process.execPath,
        [
            join(example, "node_modules/vite/bin/vite.js"),
            "preview",
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
            "--strictPort"
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
    const request = (path, options) =>
        fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual", ...options });
    const stop = async () => {
        if (child.exitCode !== null) return;
        const exited = new Promise(resolve => child.once("exit", resolve));
        child.kill("SIGTERM");
        await exited;
    };
    for (let i = 0; i < 150; i++) {
        try {
            await request("/");
            return { request, stop };
        } catch {}
        if (child.exitCode !== null) throw new Error(logs);
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    await stop();
    throw new Error(`Preview did not start:\n${logs}`);
}

test(
    "packaged preview routes static SPA documents before Nitro for every target and plugin order",
    { timeout: 180_000 },
    async t => {
        const root = await mkdtemp(join(tmpdir(), "oidc-spa-preview-build-"));
        t.after(() => rm(root, { recursive: true, force: true }));
        await mkdir(join(root, "src/routes/api"), { recursive: true });
        await mkdir(join(root, "public"));
        await mkdir(join(root, "node_modules"));
        for (const name of ["package.json", "tsconfig.json"])
            await cp(join(example, name), join(root, name));
        for (const name of await readdir(join(example, "node_modules"))) {
            if ((name.startsWith(".") && name !== ".bin") || name === "oidc-spa") continue;
            await symlink(join(example, "node_modules", name), join(root, "node_modules", name));
        }
        await cp(join(repository, "dist"), join(root, "node_modules/oidc-spa"), { recursive: true });
        for (const [name, source] of Object.entries({
            "src/router.tsx": `import {createRouter} from '@tanstack/react-router';import {routeTree} from './routeTree.gen';export const getRouter=()=>createRouter({routeTree});`,
            "src/routes/__root.tsx": `import {createRootRoute,HeadContent,Scripts} from '@tanstack/react-router';export const Route=createRootRoute({shellComponent:({children})=><html><head><HeadContent/></head><body>{children}<Scripts/></body></html>});`,
            "src/routes/index.tsx": `import {createFileRoute} from '@tanstack/react-router';export const Route=createFileRoute('/')({component:()=><h1>PRERENDERED HOME</h1>});`,
            "src/routes/pricing.tsx": `import {createFileRoute} from '@tanstack/react-router';import {probe} from '../probe';export const Route=createFileRoute('/pricing')({component:()=><><h1>PRERENDERED PRICING</h1><button onClick={()=>probe()}>Probe</button></>});`,
            "src/routes/api/probe.ts": `import {createFileRoute} from '@tanstack/react-router';import {probe} from '../../probe';export const Route=createFileRoute('/api/probe')({server:{handlers:{GET:()=>Response.json({api:'working',functionUrl:probe.url}),POST:()=>Response.json({api:'working'})}}});`,
            "src/probe.ts": `import {createServerFn} from '@tanstack/react-start';export const probe=createServerFn({method:'GET'}).handler(()=>({serverFunction:'working'}));`,
            "public/asset.txt": "STATIC ASSET"
        }))
            await writeFile(join(root, name), source);

        const build = async ({ preset, base, spa, oidcFirst }) => {
            const nitro = `nitro({ preset: ${JSON.stringify(preset)} })`;
            await writeFile(
                join(root, "vite.config.ts"),
                `
            import {defineConfig} from 'vite';import {tanstackStart} from '@tanstack/react-start/plugin/vite';
            import react from '@vitejs/plugin-react';import {nitro} from 'nitro/vite';import {oidcSpa} from 'oidc-spa/vite-plugin';
            export default defineConfig({base:${JSON.stringify(
                base
            )},resolve:{tsconfigPaths:true},plugins:[
                tanstackStart({prerender:{enabled:${spa}},spa:{enabled:${spa},maskPath:'/?__spa_shell'}}),react(),
                ${oidcFirst ? `oidcSpa(),${nitro}` : `${nitro},oidcSpa()`}
            ]});`
            );
            try {
                await promisify(execFile)(
                    process.execPath,
                    [join(example, "node_modules/vite/bin/vite.js"), "build"],
                    {
                        cwd: root,
                        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
                        maxBuffer: 10_000_000
                    }
                );
            } catch (error) {
                throw new Error(`${preset} build failed:\n${error.stdout}\n${error.stderr}`, {
                    cause: error
                });
            }
        };
        for (const preset of ["netlify", "vercel", "cloudflare-module", "node-server"]) {
            for (const base of ["/", "/dashboard/"]) {
                await t.test(`${preset} SPA ${base}`, async () => {
                    await build({ preset, base, spa: true, oidcFirst: base !== "/" });
                    const publicDir =
                        preset === "netlify"
                            ? join(root, "dist")
                            : preset === "vercel"
                            ? join(root, ".vercel/output/static")
                            : join(root, ".output/public");
                    const shell = await readFile(join(publicDir, base, "_shell.html"), "utf8");
                    assert(!shell.includes("<h1>"));
                    assert.match(shell, /<html\b[^>]*\bdata-oidc-spa-static/);
                    const preview = await startPreview(root);
                    try {
                        for (const path of [
                            "openid-callback/",
                            "openid-callback/?state=b2lkYy1zcGEu" + "a".repeat(20) + "&code=example",
                            "unknown-page"
                        ]) {
                            const response = await preview.request(base + path);
                            assert.equal(response.status, 200, path);
                            assert.equal(response.headers.get("location"), null, path);
                            assert.equal(await response.text(), shell, path);
                        }
                        const head = await preview.request(base + "openid-callback/", {
                            method: "HEAD"
                        });
                        assert.equal(head.status, 200);
                        assert.equal(await head.text(), "");
                        assert.match(await (await preview.request(base)).text(), /<h1>PRERENDERED HOME/);
                        assert.match(
                            await (await preview.request(base + "pricing/")).text(),
                            /<h1>PRERENDERED PRICING/
                        );
                        assert.equal(
                            await (await preview.request(base + "asset.txt")).text(),
                            "STATIC ASSET"
                        );
                        const api = await (await preview.request(base + "api/probe")).json();
                        assert.equal(api.api, "working");
                        assert.deepEqual(
                            await (await preview.request(base + "api/probe", { method: "POST" })).json(),
                            { api: "working" }
                        );
                        const fn = await preview.request(api.functionUrl, {
                            headers: {
                                "x-tsr-serverfn": "true",
                                "sec-fetch-site": "same-origin"
                            }
                        });
                        const fnBody = await fn.text();
                        assert.equal(fn.status, 200, fnBody);
                        assert.match(fnBody, /serverFunction.*working/);
                    } finally {
                        await preview.stop();
                    }
                });
            }
            await t.test(`${preset} SSR after SPA`, async () => {
                await build({ preset, base: "/", spa: false, oidcFirst: true });
                const preview = await startPreview(root);
                try {
                    assert.match(await (await preview.request("/")).text(), /PRERENDERED HOME/);
                    assert.equal((await preview.request("/unknown-page")).status, 404);
                    assert.equal((await preview.request("/openid-callback/")).status, 307);
                    assert.equal((await (await preview.request("/api/probe")).json()).api, "working");
                } finally {
                    await preview.stop();
                }
            });
        }
    }
);
