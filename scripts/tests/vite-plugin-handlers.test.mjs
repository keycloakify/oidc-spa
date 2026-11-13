import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { oidcSpa } from "../../dist/esm/vite-plugin/vite-plugin.mjs";

function callHook(plugin, name, context, ...args) {
    const hook = plugin[name];
    return (typeof hook === "function" ? hook : hook.handler).call(context, ...args);
}

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), "oidc-spa-vite-handlers-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "src"));
    const client = join(root, "src/client.tsx");
    const server = join(root, "src/server.ts");
    const clientSource = "export const client = true;";
    const serverSource = "export default { fetch() {} };";
    await writeFile(client, clientSource);
    await writeFile(server, serverSource);
    await writeFile(
        join(root, "index.html"),
        '<html><body><script type="module" src="/src/client.tsx"></script></body></html>'
    );
    const config = {
        root,
        base: "/app/",
        command: "serve",
        configFile: join(root, "vite.config.ts"),
        plugins: [],
        build: { outDir: "dist" },
        cacheDir: join(root, "node_modules/.vite")
    };
    return { root, client, server, clientSource, serverSource, config };
}

function pluginContext(name) {
    const watched = new Set();
    const emitted = [];
    const context = {
        environment: { name },
        addWatchFile(id) {
            assert.equal(this, context);
            watched.add(id);
        },
        emitFile(chunk) {
            assert.equal(this, context);
            emitted.push(chunk);
            return String(emitted.length);
        }
    };
    return { context, watched, emitted };
}

for (const command of ["serve", "build"]) {
    test(`TanStack Start handlers: ${command} preserves client and server entry behavior`, async t => {
        const f = await fixture(t);
        const plugin = oidcSpa();
        callHook(plugin, "configResolved", undefined, {
            ...f.config,
            command,
            plugins: [{ name: "tanstack-react-start:config" }]
        });
        for (const name of ["client", "ssr"]) {
            const { context, watched, emitted } = pluginContext(name);
            const server = await callHook(plugin, "load", context, f.server);
            assert.match(server, /__withOidcSpaServerEntry/);
            assert.equal(
                await callHook(plugin, "load", context, f.server + "?oidc-spa-original=true"),
                f.serverSource
            );
            assert(watched.has(f.server));
            const client = await callHook(plugin, "load", context, f.client);
            if (command === "build" && name === "client") {
                assert.match(client, /__oidcSpaBuild_/);
                assert(client.endsWith(f.clientSource));
                assert(!client.includes("oidcEarlyInit"));
            } else {
                assert.match(client, /oidcEarlyInit/);
                assert.match(client, /if \(shouldLoadApp\)/);
            }
            assert.equal(await callHook(plugin, "load", context, join(f.root, "unrelated.ts")), null);
            await callHook(plugin, "buildStart", context, {});
            assert.equal(emitted.length, command === "build" && name === "client" ? 1 : 0);
            if (emitted.length) {
                assert.equal(emitted[0].id, "virtual:oidc-spa/tanstack-start-client-bootstrap");
                const id = await callHook(plugin, "resolveId", context, emitted[0].id);
                assert.match(await callHook(plugin, "load", context, id), /oidcEarlyInit/);
            }
            const transformed = await callHook(
                plugin,
                "transform",
                context,
                'import {createFileRoute} from "@tanstack/react-router"; export const Route = createFileRoute("/")({beforeLoad: () => {}});',
                join(f.root, "src/route.tsx")
            );
            assert.match(transformed.code, /__disableSsrIfLoginEnforced/);
        }
    });
}

test("React Router handlers preserve the original client entry and skip TanStack handling", async t => {
    const f = await fixture(t);
    const plugin = oidcSpa();
    const { context } = pluginContext("client");
    callHook(plugin, "configResolved", undefined, {
        ...f.config,
        plugins: [{ name: "react-router" }],
        __reactRouterPluginContext: {
            entryClientFilePath: f.client,
            reactRouterConfig: { ssr: "unstable_api-only", basename: "/app/" }
        }
    });
    assert.equal(await callHook(plugin, "load", context, f.client), f.clientSource);
    const bootstrap = await callHook(
        plugin,
        "resolveId",
        context,
        "virtual:oidc-spa/react-router-bootstrap"
    );
    assert.match(await callHook(plugin, "load", context, bootstrap), /oidcEarlyInit/);
    assert.equal(await callHook(plugin, "load", context, f.server), null);
    assert.equal(await callHook(plugin, "transform", context, "export {};", f.client), null);
});

test("React Router child compiler leaves every lifecycle hook inactive", async t => {
    const f = await fixture(t);
    const plugin = oidcSpa();
    const { context, emitted, watched } = pluginContext("client");
    callHook(plugin, "configResolved", undefined, {
        ...f.config,
        // No framework metadata is available in the export-analysis compiler.
        configFile: undefined,
        plugins: [{ name: "react-router:virtual-modules" }]
    });
    assert.equal(await callHook(plugin, "resolveId", context, "anything"), null);
    assert.equal(await callHook(plugin, "load", context, f.client), null);
    assert.equal(await callHook(plugin, "transform", context, "export {};", f.client), null);
    await callHook(plugin, "buildStart", context, {});
    await callHook(plugin, "configureServer", undefined, {});
    await callHook(plugin, "generateBundle", context, {}, {}, false);
    assert.deepEqual(emitted, []);
    assert.equal(watched.size, 0);
});

for (const project of ["vanilla Vite", "Nuxt"]) {
    test(`${project} uses the shared client bootstrap`, async t => {
        const f = await fixture(t);
        const plugin = oidcSpa();
        const { context, emitted } = pluginContext("client");
        callHook(plugin, "configResolved", undefined, {
            ...f.config,
            plugins: project === "Nuxt" ? [{ name: "nuxt:environments" }] : [],
            build: { outDir: "dist", rollupOptions: { input: f.client } }
        });
        const source = await callHook(plugin, "load", context, f.client);
        assert.match(source, /oidcEarlyInit/);
        assert.match(source, /if \(shouldLoadApp\)/);
        if (project === "Nuxt") assert(source.includes("__NUXT__.config.app.baseURL"));
        assert.equal(
            await callHook(plugin, "load", context, f.client + "?oidc-spa-original=true"),
            f.clientSource
        );
        assert.equal(await callHook(plugin, "load", context, f.server), null);
        assert.equal(await callHook(plugin, "transform", context, "export {};", f.client), null);
        await callHook(plugin, "buildStart", context, {});
        assert.deepEqual(emitted, []);
    });
}

test("dependency optimization distinguishes the main and child React Router compilers", () => {
    const main = oidcSpa();
    const mainConfig = {
        plugins: [{ name: "react-router" }, { name: "react-router:virtual-modules" }, main]
    };
    callHook(main, "config", undefined, mainConfig);
    assert(mainConfig.optimizeDeps.include.includes("oidc-spa/DPoP"));

    const child = oidcSpa();
    const childConfig = {
        configFile: false,
        plugins: [{ name: "react-router:virtual-modules" }, child]
    };
    assert.equal(callHook(child, "config", undefined, childConfig), undefined);
    assert.equal(childConfig.optimizeDeps, undefined);

    const vanilla = oidcSpa();
    const vanillaConfig = { configFile: false, plugins: [vanilla] };
    callHook(vanilla, "config", undefined, vanillaConfig);
    assert(vanillaConfig.optimizeDeps.exclude.includes("oidc-spa"));
});
