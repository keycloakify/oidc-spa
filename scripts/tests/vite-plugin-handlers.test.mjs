import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { oidcSpa } from "../../dist/esm/vite-plugin/vite-plugin.mjs";

function callHook(plugin, name, context, ...args) {
    if (Array.isArray(plugin)) plugin = plugin.find(plugin => plugin.name === "oidc-spa");
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
            assert(
                server.includes(
                    'import { withOidcSpaServerEntry } from "oidc-spa/tanstack-start/server-entry";'
                )
            );
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
                assert.match(client, /if \(shouldLoadApp\) \{\s*import\(/);
            }
            assert.equal(await callHook(plugin, "load", context, join(f.root, "unrelated.ts")), null);
            await callHook(plugin, "buildStart", context, {});
            assert.equal(emitted.length, command === "build" && name === "client" ? 1 : 0);
            if (emitted.length) {
                assert.equal(emitted[0].id, "virtual:oidc-spa/tanstack-start-client-bootstrap");
                const id = await callHook(plugin, "resolveId", context, emitted[0].id);
                const bootstrap = await callHook(plugin, "load", context, id);
                assert.match(bootstrap, /oidcEarlyInit/);
                assert.match(bootstrap, /if \(shouldLoadApp\) \{\s*import\(/);
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

for (const command of ["serve", "build"]) {
    for (const optionsKey of ["rollupOptions", "rolldownOptions"]) {
        test(`Nuxt ${command}: ${optionsKey} selects the client environment entry and leaves SSR alone`, async t => {
            const f = await fixture(t);
            const plugin = oidcSpa();
            callHook(plugin, "configResolved", undefined, {
                ...f.config,
                command,
                plugins: [{ name: "nuxt:environments" }],
                build: { rollupOptions: { input: f.server } },
                environments: {
                    client: { build: { [optionsKey]: { input: { entry: "src/client.tsx" } } } },
                    ssr: { build: { [optionsKey]: { input: f.client } } }
                }
            });
            assert.equal(callHook(plugin, "applyToEnvironment", undefined, { name: "client" }), true);
            assert.equal(callHook(plugin, "applyToEnvironment", undefined, { name: "ssr" }), false);
            assert.equal(callHook(plugin, "applyToEnvironment", undefined, { name: "nitro" }), false);
            const { context } = pluginContext("client");
            const source = await callHook(plugin, "load", context, f.client);
            assert.match(source, /oidcEarlyInit/);
            assert.match(source, /__NUXT__\.config\.app\.baseURL/);
            assert.equal(await callHook(plugin, "load", context, f.server), null);
            assert.equal(
                await callHook(plugin, "load", context, f.client + "?oidc-spa-original=true"),
                f.clientSource
            );
        });
    }
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

for (const command of ["serve", "build"]) {
    for (const spa of [false, true]) {
        test(`TanStack bootstrap defaults routing cookies independently of SPA mode: command=${command}, spa=${spa}`, async t => {
            const f = await fixture(t);
            const plugin = oidcSpa();
            callHook(plugin, "configResolved", undefined, {
                ...f.config,
                command,
                define: { "import.meta.env.TSS_SHELL": JSON.stringify(String(spa)) },
                plugins: [{ name: "tanstack-react-start:config" }]
            });
            const { context } = pluginContext("ssr");
            const source = await callHook(plugin, "load", context, f.client);
            const { runInNewContext } = await import("node:vm");
            let received;
            runInNewContext(source.replace(/^import .*;$/gm, ""), {
                document: { documentElement: { hasAttribute: () => spa } },
                oidcEarlyInit(params) {
                    received = params;
                    return { shouldLoadApp: false };
                }
            });
            assert.equal(received.enableRoutingCookie, true);
            assert.equal(received.redirectUriPath, undefined);
            assert.equal("ssr" in received, false);
            assert.equal("enableRoutingCookie" in received.securityDefenses, false);
        });
    }
}

for (const spa of [false, true]) {
    test(`TanStack dev leaves document routing to Start and retains runtime config watching: spa=${spa}`, async t => {
        const f = await fixture(t);
        const plugin = oidcSpa({ redirectUriPath: "/openid-callback/", enableRoutingCookie: false });
        callHook(plugin, "configResolved", undefined, {
            ...f.config,
            define: { "import.meta.env.TSS_SHELL": JSON.stringify(String(spa)) },
            plugins: [{ name: "tanstack-react-start:config" }]
        });
        const middleware = [];
        const watcher = new EventEmitter();
        const httpServer = new EventEmitter();
        callHook(plugin, "configureServer", undefined, {
            environments: {},
            watcher,
            httpServer,
            middlewares: { use: handler => middleware.push(handler) }
        });
        assert.equal(watcher.listenerCount("change"), 1);
        assert.equal(middleware.length, 0);
        assert.equal(plugin.configurePreviewServer, undefined);
        assert.equal(plugin.nitro, undefined);
        httpServer.emit("close");
        assert.equal(watcher.listenerCount("change"), 0);
    });
}

for (const project of ["tanstack-start", "react-router-framework", "other", "nuxt"]) {
    for (const enableRoutingCookie of [undefined, false, true]) {
        test(`bootstrap options execute correctly: ${project}, cookie=${enableRoutingCookie}`, async t => {
            const f = await fixture(t);
            const redirectUriPath = '/login-"callback/';
            const plugin = oidcSpa({ redirectUriPath, enableRoutingCookie });
            callHook(plugin, "configResolved", undefined, {
                ...f.config,
                base: '/team-"quoted/',
                plugins:
                    project === "tanstack-start"
                        ? [{ name: "tanstack-react-start:config" }]
                        : project === "react-router-framework"
                        ? [{ name: "react-router" }]
                        : project === "nuxt"
                        ? [{ name: "nuxt:environments" }]
                        : [],
                build: { rollupOptions: { input: f.client } },
                __reactRouterPluginContext: {
                    entryClientFilePath: f.client,
                    reactRouterConfig: { ssr: false, basename: "/" }
                }
            });
            const { context } = pluginContext("client");
            let source;
            if (project === "react-router-framework") {
                const id = await callHook(
                    plugin,
                    "resolveId",
                    context,
                    "virtual:oidc-spa/react-router-bootstrap"
                );
                source = await callHook(plugin, "load", context, id);
            } else {
                source = await callHook(plugin, "load", context, f.client);
            }
            const { runInNewContext } = await import("node:vm");
            let received;
            runInNewContext(source.replace(/^import .*;$/gm, ""), {
                __NUXT__: { config: { app: { baseURL: '/team-"quoted/' } } },
                oidcEarlyInit(params) {
                    received = params;
                    return { shouldLoadApp: false };
                }
            });
            assert.equal(received.BASE_URL, '/team-"quoted/');
            assert.equal(received.redirectUriPath, redirectUriPath);
            assert.equal(
                received.enableRoutingCookie,
                enableRoutingCookie ?? (project === "tanstack-start" ? true : undefined)
            );
            assert.equal("ssr" in received, false);
            assert.equal("useLegacyRedirectUri" in received, false);
            assert.equal("redirectUriPath" in received.securityDefenses, false);
            if (project === "tanstack-start") {
                const serverEntry_original = { fetch() {} };
                const serverSource = await callHook(plugin, "load", context, f.server);
                let serverParams;
                runInNewContext(
                    serverSource
                        .replace(/^import .*;$/gm, "")
                        .replace("export default serverEntry;", ""),
                    {
                        serverEntry_original,
                        withOidcSpaServerEntry(params) {
                            serverParams = params;
                            return params.serverEntry_original;
                        }
                    }
                );
                assert.equal(serverParams.serverEntry_original, serverEntry_original);
                assert.equal(serverParams.resolvedConfigBase, received.BASE_URL);
                assert.equal(serverParams.oidcSpaVitePluginParams_redirectUriPath, redirectUriPath);
            }
        });
    }
}

for (const redirectUriPath of [undefined, "/login/callback/"]) {
    test(`React Router dev preserves ordinary home loaders and isolates callbacks: ${redirectUriPath}`, async t => {
        const f = await fixture(t);
        const plugin = oidcSpa({ redirectUriPath });
        callHook(plugin, "configResolved", undefined, {
            ...f.config,
            publicDir: join(f.root, "public"),
            plugins: [{ name: "react-router" }],
            __reactRouterPluginContext: {
                entryClientFilePath: f.client,
                reactRouterConfig: { ssr: false, basename: "/app/" }
            }
        });
        const middleware = [];
        callHook(plugin, "configureServer", undefined, {
            middlewares: { use: handler => middleware.push(handler) },
            environments: {
                ssr: {
                    runner: {
                        import: async () => ({
                            isApiOnly: false,
                            basename: "/app/",
                            isResourceRequest: () => false,
                            handleDocument: async () => new Response(null, { status: 204 })
                        })
                    }
                }
            }
        });
        const callback = "/app/" + (redirectUriPath ?? "/").slice(1);
        const state = "b2lkYy1zcGEu" + "a".repeat(20);
        for (const [url, servesNeutralDocument] of [
            ["/app/", false],
            ["/app/?state=ordinary&tab=security", false],
            [callback + "?state=" + state, true],
            [callback, redirectUriPath !== undefined]
        ]) {
            const request = { url, method: "GET", headers: { host: "app.test", accept: "text/html" } };
            let forwarded = false;
            let ended = false;
            const response = Object.assign(new EventEmitter(), {
                setHeader() {},
                end() {
                    ended = true;
                }
            });
            await middleware[0](request, response, error => {
                if (error) throw error;
                forwarded = true;
            });
            assert.equal(ended, servesNeutralDocument, url);
            assert.equal(forwarded, !servesNeutralDocument, url);
        }
    });
}
