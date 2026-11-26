import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    createReactRouterRequestHandler,
    createReactRouterFetchHandler
} from "../../dist/esm/vite-plugin/react-router-framework/reactRouterServer.mjs";

function fixture(base = "/") {
    let rootLoads = 0;
    const build = {
        ssr: true,
        unstable_apiOnly: true,
        isSpaMode: true,
        prerender: [],
        basename: base,
        publicPath: base,
        assetsBuildDirectory: "build/client",
        future: {},
        routeDiscovery: { mode: "lazy", manifestPath: "__manifest" },
        assets: {
            version: "fixture",
            url: base + "manifest.js",
            entry: { module: "entry.js", imports: [] },
            routes: {}
        },
        entry: {
            module: {
                default() {
                    throw new Error("UI documents must never be rendered");
                },
                handleError() {}
            }
        },
        routes: {
            root: {
                id: "root",
                path: "",
                module: {
                    default() {},
                    loader() {
                        rootLoads++;
                        return {};
                    },
                    middleware: [
                        async (_args, next) => {
                            const response = await next();
                            response.headers.set("x-parent-middleware", "yes");
                            return response;
                        }
                    ]
                }
            },
            page: {
                id: "page",
                parentId: "root",
                path: "page",
                module: { default() {}, loader: () => ({ value: "NATIVE DATA" }) }
            },
            api: {
                id: "api",
                parentId: "root",
                path: "api/:id",
                module: {
                    loader: ({ request, params }) => {
                        if (!request.headers.has("Authorization"))
                            throw new Response("Unauthorized", { status: 401 });
                        return Response.json(
                            { id: params.id, url: request.url },
                            { headers: { "Cache-Control": "no-store" } }
                        );
                    },
                    action: async ({ request }) => Response.json(await request.json(), { status: 201 })
                }
            },
            stream: {
                id: "stream",
                parentId: "root",
                path: "stream",
                module: {
                    loader: () =>
                        new Response(
                            new ReadableStream({
                                start(controller) {
                                    controller.enqueue(new TextEncoder().encode("STREAM"));
                                    controller.close();
                                }
                            }),
                            { headers: { "Set-Cookie": "test=value; Path=/" } }
                        )
                }
            }
        }
    };
    return { build, handler: createReactRouterRequestHandler(build), rootLoads: () => rootLoads };
}

test("pure SPA builds do not dispatch resource handlers or require a discovery path", () => {
    const f = fixture();
    f.build.ssr = false;
    f.build.unstable_apiOnly = false;
    f.build.routeDiscovery = { mode: "initial" };
    const handler = createReactRouterRequestHandler(f.build);
    assert.equal(handler.isResourceRequest(new URL("https://example.com/api/item")), false);
});

for (const base of ["/", "/dashboard/"]) {
    test(`generated fetch serves existing HTML without invoking React: ${base}`, async t => {
        const directory = await mkdtemp(join(tmpdir(), "oidc-rr-shell-"));
        t.after(() => rm(directory, { recursive: true, force: true }));
        await writeFile(join(directory, "index.html"), "STATIC INDEX");
        const { build } = fixture(base);
        // The production API-only compiler strips UI exports from server modules.
        build.routes.page.module.default = undefined;
        build.assets.routes.page = { hasDefaultExport: true, hasErrorBoundary: false };
        build.assetsBuildDirectory = directory;
        let initialized = 0;
        const fetch = createReactRouterFetchHandler(() => {
            initialized++;
            return build;
        });
        assert.equal(initialized, 0, "build metadata is read after module initialization");
        for (const path of ["page", "openid-callback/", "unknown-page"]) {
            const response = await fetch(
                new Request(`https://example.com${base}${path}`, { headers: { Accept: "text/html" } })
            );
            assert.equal(response.status, 200);
            assert.equal(await response.text(), "STATIC INDEX");
            assert.equal(response.headers.get("Cache-Control"), "no-cache");
        }
        assert.equal(initialized, 1);
        const head = await fetch(new Request(`https://example.com${base}page`, { method: "HEAD" }));
        assert.equal(head.status, 200);
        assert.equal(await head.text(), "");
        for (const path of ["assets/missing.js", "api/missing/route"]) {
            assert.equal((await fetch(new Request(`https://example.com${base}${path}`))).status, 404);
        }
        if (base !== "/") {
            assert.equal(
                (
                    await fetch(
                        new Request("https://example.com/outside", { headers: { Accept: "text/html" } })
                    )
                ).status,
                404
            );
        }
        const denied = await fetch(
            new Request(`https://example.com${base}api/item`, { headers: { Accept: "text/html" } })
        );
        assert.equal(denied.status, 401);
        const data = await fetch(new Request(`https://example.com${base}page.data`));
        assert.match(await data.text(), /NATIVE DATA/);
        const mutation = await fetch(new Request(`https://example.com${base}page`, { method: "POST" }));
        assert.equal(mutation.status, 405);
        await writeFile(join(directory, "__spa-fallback.html"), "STATIC FALLBACK");
        const fallbackFetch = createReactRouterFetchHandler(() => build);
        assert.equal(
            await (await fallbackFetch(new Request(`https://example.com${base}page`))).text(),
            "STATIC FALLBACK"
        );
    });
    test(`API-only resource routes retain native responses, methods and middleware: ${base}`, async () => {
        const f = fixture(base);
        const url = `https://example.com${base}api/item?query=preserved`;
        const response = await f.handler(
            new Request(url, { headers: { Authorization: "Bearer example", Accept: "text/html" } })
        );
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { id: "item", url });
        assert.equal(response.headers.get("x-parent-middleware"), "yes");
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        assert.equal(f.rootLoads(), 0, "resource calls do not execute parent UI loaders");
        for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
            const response = await f.handler(
                new Request(url, {
                    method,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ method })
                })
            );
            assert.equal(response.status, 201);
            assert.deepEqual(await response.json(), { method });
        }
        const head = await f.handler(
            new Request(url, { method: "HEAD", headers: { Authorization: "Bearer example" } })
        );
        assert.equal(head.status, 200);
        assert.equal(await head.text(), "");
        const denied = await f.handler(new Request(url));
        assert.equal(denied.status, 401);
        assert.equal(await denied.text(), "Unauthorized");
        const stream = await f.handler(new Request(`https://example.com${base}stream`));
        assert.equal(await stream.text(), "STREAM");
        assert.deepEqual(stream.headers.getSetCookie(), ["test=value; Path=/"]);
        assert.equal(f.build.unstable_apiOnly, true, "the original build stays API-only");
    });

    test(`API-only UI documents remain disabled and native data requests still work: ${base}`, async () => {
        const f = fixture(base);
        for (const path of ["", "page", "missing", "api/missing/extra"]) {
            const response = await f.handler(new Request(`https://example.com${base}${path}`));
            assert.equal(response.status, 404);
        }
        const response = await f.handler(new Request(`https://example.com${base}page.data`));
        assert.equal(response.status, 200);
        assert.match(await response.text(), /NATIVE DATA/);
        assert.equal(
            f.handler.isResourceRequest(new URL(`https://example.com${base}__manifest`)),
            false
        );
        assert.equal(
            f.handler.isResourceRequest(new URL(`https://example.com${base}api/item.data`)),
            false
        );
    });
}
