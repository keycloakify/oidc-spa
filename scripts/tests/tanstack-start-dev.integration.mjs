import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const example = join(repository, "examples/tanstack-start");
const asset = '<svg xmlns="http://www.w3.org/2000/svg"><title>STATIC ASSET</title></svg>';

function waitForMessage(socket, predicate) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            socket.removeEventListener("message", onMessage);
            reject(new Error("Timed out waiting for a Vite HMR message"));
        }, 10_000);
        function onMessage(event) {
            const message = JSON.parse(event.data);
            if (!predicate(message)) return;
            clearTimeout(timeout);
            socket.removeEventListener("message", onMessage);
            resolve(message);
        }
        socket.addEventListener("message", onMessage);
    });
}

async function startDev(root, base) {
    const socket = createServer();
    await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    const child = spawn(
        process.execPath,
        [
            join(example, "node_modules/vite/bin/vite.js"),
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
    const origin = `http://127.0.0.1:${port}`;
    const request = (path, options) => fetch(origin + path, { redirect: "manual", ...options });
    const stop = async () => {
        if (child.exitCode !== null) return;
        const exited = new Promise(resolve => child.once("exit", resolve));
        child.kill("SIGTERM");
        await exited;
    };
    for (let i = 0; i < 150; i++) {
        try {
            const response = await request(base);
            if (response.status !== 200) {
                await response.body?.cancel();
                throw new Error(`Home returned ${response.status}\n${logs}`);
            }
            return { origin, request, stop };
        } catch (error) {
            if (error.message.startsWith("Home returned")) {
                await stop();
                throw error;
            }
        }
        if (child.exitCode !== null) throw new Error(logs);
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    await stop();
    throw new Error(`Dev server did not start:\n${logs}`);
}

test(
    "packaged dev supports SPA and SSR callbacks, backend routes and HMR",
    { timeout: 120_000 },
    async t => {
        const root = await mkdtemp(join(tmpdir(), "oidc-spa-dev-"));
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
            "src/routes/index.tsx": `import {createFileRoute} from '@tanstack/react-router';import {getProbe,postProbe} from '../probe';export const Route=createFileRoute('/')({component:()=><><h1>DEV HOME</h1><button onClick={()=>getProbe()}>GET</button><button onClick={()=>postProbe()}>POST</button></>});`,
            "src/routes/pricing.tsx": `import {createFileRoute} from '@tanstack/react-router';export const Route=createFileRoute('/pricing')({component:()=><h1>DEV PRICING</h1>});`,
            "src/routes/api/probe.ts": `import {createFileRoute} from '@tanstack/react-router';import {getProbe,postProbe} from '../../probe';export const Route=createFileRoute('/api/probe')({server:{handlers:{GET:()=>Response.json({api:'working',getUrl:getProbe.url,postUrl:postProbe.url}),POST:async({request})=>Response.json(await request.json())}}});`,
            "src/probe.ts": `import {createServerFn} from '@tanstack/react-start';export const getProbe=createServerFn({method:'GET'}).handler(()=>({serverFunction:'GET working'}));export const postProbe=createServerFn({method:'POST'}).handler(()=>({serverFunction:'POST working'}));`,
            "public/asset.svg": asset
        }))
            await writeFile(join(root, name), source);

        const cases = [];
        for (const spa of [true, false]) {
            for (const base of ["/", "/dashboard/"]) {
                for (const oidcFirst of [true, false])
                    cases.push({ spa, base, oidcFirst, withNitro: true });
            }
            cases.push({ spa, base: "/dashboard/", oidcFirst: false, withNitro: false });
        }
        for (const { spa, base, oidcFirst, withNitro } of cases) {
            await t.test(
                `spa=${spa}, base=${base}, oidcFirst=${oidcFirst}, nitro=${withNitro}`,
                async () => {
                    await writeFile(
                        join(root, "vite.config.ts"),
                        `
                import {defineConfig} from 'vite';import {tanstackStart} from '@tanstack/react-start/plugin/vite';
                import react from '@vitejs/plugin-react';import {nitro} from 'nitro/vite';import {oidcSpa} from 'oidc-spa/vite-plugin';
                export default defineConfig({base:${JSON.stringify(
                    base
                )},server:{fs:{allow:[${JSON.stringify(root)},${JSON.stringify(
                            example
                        )}]}},resolve:{tsconfigPaths:true},plugins:[
                    tanstackStart({spa:{enabled:${spa}}}),react(),
                    ${withNitro ? (oidcFirst ? "oidcSpa(),nitro()" : "nitro(),oidcSpa()") : "oidcSpa()"}
                ]});`
                    );
                    const server = await startDev(root, base);
                    try {
                        const home = await (await server.request(base)).text();
                        assert.equal(home.includes("<h1>DEV HOME"), !spa);
                        const entryPath = home.match(
                            /src="([^"]*virtual:tanstack-start-dev-client-entry)"/
                        )[1];
                        const entryCode = await (await server.request(entryPath)).text();
                        const clientPath = entryCode.match(/await import\("([^"]+)"\)/)[1];
                        const bootstrap = await (await server.request(clientPath)).text();
                        assert.match(bootstrap, /oidcEarlyInit/);
                        assert.match(bootstrap, new RegExp(`ssr:\\s*${!spa}`));
                        const pricing = await (await server.request(base + "pricing")).text();
                        assert.equal(pricing.includes("<h1>DEV PRICING"), !spa);
                        for (const query of spa
                            ? ["", "?state=b2lkYy1zcGEu" + "a".repeat(20) + "&code=example"]
                            : [""]) {
                            const response = await server.request(base + "openid-callback/" + query);
                            assert.equal(response.status, spa ? 200 : 307);
                            if (spa) {
                                assert.equal(response.headers.get("location"), null);
                                assert(!(await response.text()).includes("<h1>"));
                            }
                        }
                        const head = await server.request(base + "openid-callback/", { method: "HEAD" });
                        assert.equal(head.status, spa ? 200 : 307);
                        assert.equal(await head.text(), "");
                        assert.equal(await (await server.request(base + "asset.svg")).text(), asset);
                        const api = await (await server.request(base + "api/probe")).json();
                        assert.equal(api.api, "working");
                        const payload = { message: "BODY PRESERVED" };
                        const post = await server.request(base + "api/probe", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload)
                        });
                        assert.deepEqual(await post.json(), payload);
                        for (const [method, url] of [
                            ["GET", api.getUrl],
                            ["POST", api.postUrl]
                        ]) {
                            const response = await server.request(url, {
                                method,
                                headers: {
                                    "x-tsr-serverfn": "true",
                                    "sec-fetch-site": "same-origin"
                                }
                            });
                            assert.equal(response.status, 200);
                            assert.match(
                                await response.text(),
                                new RegExp(`serverFunction.*${method} working`)
                            );
                        }
                        const client = await server.request(base + "@vite/client");
                        assert.equal(client.status, 200);
                        const clientCode = await client.text();
                        assert.match(clientCode, /WebSocket/);
                        if (spa && base === "/" && oidcFirst && withNitro) {
                            const token = clientCode.match(/const wsToken = "([^"]+)"/)[1];
                            const socket = new WebSocket(
                                server.origin.replace("http:", "ws:") + base + "?token=" + token,
                                "vite-hmr"
                            );
                            const connected = waitForMessage(
                                socket,
                                message => message.type === "connected"
                            );
                            const pricingPath = join(root, "src/routes/pricing.tsx");
                            const original = await readFile(pricingPath, "utf8");
                            try {
                                await connected;
                                assert.equal(
                                    (
                                        await server.request(
                                            base + "src/routes/pricing.tsx?tsr-split=component"
                                        )
                                    ).status,
                                    200
                                );
                                const update = waitForMessage(socket, message =>
                                    ["update", "full-reload"].includes(message.type)
                                );
                                await writeFile(
                                    pricingPath,
                                    original.replace("DEV PRICING", "DEV PRICING UPDATED")
                                );
                                await update;
                                assert.match(
                                    await (
                                        await server.request(
                                            base + "src/routes/pricing.tsx?tsr-split=component"
                                        )
                                    ).text(),
                                    /DEV PRICING UPDATED/
                                );
                            } finally {
                                socket.close();
                                await writeFile(pricingPath, original);
                            }
                        }
                    } finally {
                        await server.stop();
                    }
                }
            );
        }
    }
);
