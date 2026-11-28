import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const example = join(repository, "examples/tanstack-start");

async function htmlFiles(directory, prefix = "") {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const relative = prefix + entry.name;
        if (entry.isDirectory())
            result.push(...(await htmlFiles(join(directory, entry.name), relative + "/")));
        else if (entry.name.endsWith(".html")) result.push(relative);
    }
    return result.sort();
}

test(
    "TanStack auth bootstrap preserves native deployment output with SSR or SPA",
    { timeout: 120_000 },
    async t => {
        const root = await mkdtemp(join(tmpdir(), "oidc-spa-start-build-"));
        t.after(() => rm(root, { recursive: true, force: true }));
        await mkdir(join(root, "src/routes"), { recursive: true });
        await mkdir(join(root, "node_modules"));
        for (const name of ["package.json", "tsconfig.json"])
            await cp(join(example, name), join(root, name));
        for (const name of await readdir(join(example, "node_modules"))) {
            if (name.startsWith(".") || name === "oidc-spa") continue;
            await symlink(join(example, "node_modules", name), join(root, "node_modules", name));
        }
        await cp(join(repository, "dist"), join(root, "node_modules/oidc-spa"), { recursive: true });
        for (const [name, source] of Object.entries({
            "src/router.tsx": `import {canary} from './canary';import {createRouter} from '@tanstack/react-router';import {routeTree} from './routeTree.gen';export const getRouter=()=>{canary();return createRouter({routeTree});};`,
            "src/canary.ts": `export function canary(){globalThis.__oidc_spa_application_canary__=true;}`,
            "src/routes/__root.tsx": `import {createRootRoute,HeadContent,Scripts} from '@tanstack/react-router';export const Route=createRootRoute({shellComponent:({children})=><html><head><HeadContent/></head><body>{children}<Scripts/></body></html>});`,
            "src/routes/index.tsx": `import {createFileRoute} from '@tanstack/react-router';export const Route=createFileRoute('/')({component:()=><h1>BUILD HOME</h1>});`,
            "src/routes/pricing.tsx": `import {createFileRoute} from '@tanstack/react-router';export const Route=createFileRoute('/pricing')({component:()=><h1>BUILD PRICING</h1>});`,
            "src/routes/rpc-probe.ts": `import {createFileRoute} from '@tanstack/react-router';export const Route=createFileRoute('/rpc-probe')({server:{handlers:{GET:()=>Response.json({ok:true})}}});`
        }))
            await writeFile(join(root, name), source);

        for (const options of [
            { spa: false, prerender: false, base: "/", oidcFirst: false },
            { spa: true, prerender: false, base: "/", oidcFirst: true },
            {
                spa: true,
                prerender: true,
                base: "/",
                redirectUriPath: "/login/callback/",
                oidcFirst: false
            },
            {
                spa: true,
                prerender: true,
                base: "/dashboard/",
                redirectUriPath: "/login/callback/",
                oidcFirst: true
            }
        ]) {
            await t.test(JSON.stringify(options), async () => {
                const { spa, prerender, base, redirectUriPath, oidcFirst } = options;
                let nativeConfig;
                let nativeHtmlFiles;
                // The example/deployment owns CDN routing. Verify that adding oidc-spa
                // only changes the browser bootstrap, including for a home callback.
                for (const withOidc of [false, true]) {
                    const nitro = 'nitro({preset:"vercel"})';
                    const oidc = `oidcSpa(${JSON.stringify({
                        enableRoutingCookie: !spa,
                        redirectUriPath
                    })})`;
                    const plugins = !withOidc
                        ? nitro
                        : oidcFirst
                        ? `${oidc},${nitro}`
                        : `${nitro},${oidc}`;
                    await writeFile(
                        join(root, "vite.config.ts"),
                        `
import {defineConfig} from 'vite';import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';import {nitro} from 'nitro/vite';import {oidcSpa} from 'oidc-spa/vite-plugin';
export default defineConfig({base:${JSON.stringify(
                            base
                        )},resolve:{tsconfigPaths:true,dedupe:['oidc-spa']},plugins:[
tanstackStart({serverFns:{base:'/actions'},prerender:{enabled:${prerender}},spa:{enabled:${spa},maskPath:'/?__spa_shell'}}),react(),${plugins}
]});`
                    );
                    try {
                        await promisify(execFile)(
                            process.execPath,
                            [join(example, "node_modules/vite/bin/vite.js"), "build"],
                            { cwd: root, maxBuffer: 10_000_000 }
                        );
                    } catch (error) {
                        throw new Error(
                            `Start build failed (oidc-spa=${withOidc}):\n${error.stdout}\n${error.stderr}`,
                            { cause: error }
                        );
                    }
                    const output = join(root, ".vercel/output");
                    const config = await readFile(join(output, "config.json"), "utf8");
                    const publicDir = join(output, "static");
                    const documents = await htmlFiles(publicDir);
                    if (!withOidc) {
                        nativeConfig = config;
                        nativeHtmlFiles = documents;
                        continue;
                    }
                    assert.equal(
                        config,
                        nativeConfig,
                        "oidc-spa must not add or reorder deployment rules"
                    );
                    assert.deepEqual(
                        documents,
                        nativeHtmlFiles,
                        "oidc-spa must not move, copy or generate HTML files"
                    );
                    for (const file of documents)
                        assert.doesNotMatch(
                            await readFile(join(publicDir, file), "utf8"),
                            /data-oidc-spa-static/
                        );
                    const assets = join(publicDir, "assets");
                    const bootstrap = (await readdir(assets)).filter(name =>
                        /^oidc-spa-bootstrap-.*\.js$/.test(name)
                    );
                    assert.equal(bootstrap.length, 1);
                    assert.doesNotMatch(
                        await readFile(join(assets, bootstrap[0]), "utf8"),
                        /__oidc_spa_application_canary__/
                    );
                    const scripts = await Promise.all(
                        (await readdir(assets))
                            .filter(name => name.endsWith(".js"))
                            .map(name => readFile(join(assets, name), "utf8"))
                    );
                    assert(
                        scripts.some(source => source.includes("__oidc_spa_application_canary__")),
                        "the application code must still be built"
                    );
                }
            });
        }
    }
);
