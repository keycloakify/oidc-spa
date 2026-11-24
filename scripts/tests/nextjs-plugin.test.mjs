import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { build } from "esbuild";
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unwatchFile } from "node:fs";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server.js");

async function load(contents, { stubs = {}, globals = {} } = {}) {
    const { outputFiles } = await build({
        stdin: { contents, resolveDir: fileURLToPath(new URL("../../", import.meta.url)) },
        bundle: true,
        platform: "node",
        format: "cjs",
        write: false,
        external: ["next/*"],
        plugins: [
            {
                name: "nextjs-fixture",
                setup(build) {
                    build.onResolve({ filter: /.*/ }, ({ path }) =>
                        Object.hasOwn(stubs, path) ? { path, namespace: "fixture" } : undefined
                    );
                    build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
                        contents: stubs[path]
                    }));
                }
            }
        ]
    });
    const module = { exports: {} };
    runInNewContext(outputFiles[0].text, { module, require, URL, console, process, ...globals });
    return module.exports;
}

const { withOidcSpa } = await load('export { withOidcSpa } from "./src/nextjs-plugin";', {
    stubs: { "./generateProxy": "export async function generateProxy() {}" }
});
const { generateProxy } = await load(
    'export { generateProxy } from "./src/nextjs-plugin/generateProxy";'
);
const loadProxy = (fetch = () => assert.fail("Unexpected forwarded request")) =>
    load('export * from "./src/nextjs-plugin/proxy";', { globals: { Headers, fetch } });
const state = "b2lkYy1zcGEu".padEnd(32, "a");
const cookie = destination =>
    `oidc_${state}=${Math.floor(Date.now() / 1000)}%_${encodeURIComponent(destination)}`;
async function forwardedUrl(request) {
    const { proxy } = await loadProxy(
        async url => new Response(null, { headers: { "x-target": url.href } })
    );
    return (await proxy(request)).headers.get("x-target");
}

function request(path, { destination, basePath = "", method = "GET", extraCookie = "" } = {}) {
    return new NextRequest(`https://app.test${path}`, {
        method,
        nextConfig: { basePath },
        headers: {
            cookie: [extraCookie, destination === undefined ? "" : cookie(destination)]
                .filter(Boolean)
                .join("; ")
        }
    });
}

test("plugin preserves Next config and injects initialization ahead of other instrumentation", async () => {
    const rewrites = async () => [];
    const config = await withOidcSpa(
        {
            basePath: "/app",
            env: { CUSTOM: "kept" },
            rewrites,
            instrumentationClientInject: ["analytics/client"]
        },
        {
            DPoP: { enabled: true, mode: "enforced" },
            browserRuntimeFreeze: { enabled: true, excludes: ["Array", "Object"] },
            tokenSubstitution: { enabled: true, trustedExternalResourceServers: ["https://api.test"] }
        }
    )("phase-production-build", { defaultConfig: {} });
    assert.equal(config.rewrites, rewrites);
    assert.equal(config.env.CUSTOM, "kept");
    assert.equal(config.env.OIDC_SPA_NEXTJS_BASE_URL, "/app/");
    assert.equal(config.skipTrailingSlashRedirect, true);
    assert.deepEqual(Array.from(config.instrumentationClientInject), [
        "oidc-spa/nextjs-plugin/client",
        "analytics/client"
    ]);
    assert.deepEqual(JSON.parse(config.env.OIDC_SPA_NEXTJS_BROWSER_RUNTIME_FREEZE), {
        excludes: ["Array", "Object"]
    });
    assert.deepEqual(JSON.parse(config.env.OIDC_SPA_NEXTJS_DPOP), { mode: "enforced" });
});

test("injected client calls earlyInit synchronously with configured defenses and base path", async () => {
    for (const options of [
        {},
        {
            DPoP: { enabled: true, mode: "auto" },
            browserRuntimeFreeze: { enabled: true },
            tokenSubstitution: { enabled: true }
        }
    ]) {
        const calls = [];
        await load('import "./src/nextjs-plugin/client";', {
            globals: {
                process: {
                    env: (
                        await withOidcSpa({ basePath: "/app" }, options)("phase-production-build", {
                            defaultConfig: {}
                        })
                    ).env
                },
                record: (...args) => calls.push(args)
            },
            stubs: {
                "../entrypoint": `
                    export function oidcEarlyInit(params) {
                        record("earlyInit", params);
                        return { shouldLoadApp: true };
                    }

                `,
                "../DPoP":
                    'export function DPoP(params) { record("DPoP", params); return { enableDPoP() {} }; }',
                "../browser-runtime-freeze":
                    'export function browserRuntimeFreeze(params) { record("freeze", params); return { enableBrowserRuntimeFreeze() {} }; }',
                "../token-substitution":
                    'export function tokenSubstitution(params) { record("substitution", params); return { enableTokenSubstitution() {} }; }'
            }
        });
        const [name, params] = calls.at(-1);
        assert.equal(name, "earlyInit");
        assert.equal(params.BASE_URL, "/app/");
        assert.equal(Object.keys(params.securityDefenses).length, options.DPoP ? 3 : 0);
        assert.equal(params.ssr, true);
        assert.equal(calls.length, options.DPoP ? 4 : 1);
    }
});

test("Next client instrumentation passes the SSR flag regardless of callback handling", async () => {
    const { env } = await withOidcSpa()("phase-production-build", { defaultConfig: {} });
    for (const shouldLoadApp of [false, true]) {
        let received;
        await load('import "./src/nextjs-plugin/client";', {
            globals: {
                process: { env },
                shouldLoadApp,
                capture: params => {
                    received = params;
                }
            },
            stubs: {
                "./core/earlyInit":
                    "export function oidcEarlyInit(params) { capture(params); return { shouldLoadApp }; }"
            }
        });
        assert.equal(received.ssr, true);
    }
});

for (const outcome of ["code=auth-code", "error=login_required"]) {
    test(`callback ${outcome} fetches the destination without changing the browser URL`, async () => {
        const req = request(`/?${outcome}&state=${state}`, {
            destination: "/account?tab=security#methods",
            extraCookie: "session=kept; deployment-protection=kept"
        });
        const fetched = new Response("<html>Destination</html>", {
            headers: {
                "content-type": "text/html",
                "x-custom": "kept",
                "cdn-cache-control": "public, max-age=600",
                "vercel-cdn-cache-control": "public, max-age=600"
            }
        });
        fetched.headers.append("set-cookie", "first=one; Path=/");
        fetched.headers.append("set-cookie", "second=two; Path=/");
        let calls = 0;
        const { proxy } = await loadProxy(async (url, options) => {
            calls++;
            assert.equal(url.href, "https://app.test/account?tab=security");
            assert.equal(options.cache, "no-store");
            assert.equal(options.redirect, "manual");
            assert.strictEqual(options.signal, req.signal);
            assert.equal(options.headers.get("cookie"), "session=kept; deployment-protection=kept");
            return fetched;
        });
        const response = await proxy(req);
        assert.equal(calls, 1);
        assert.strictEqual(response.body, fetched.body);
        assert.equal(await response.text(), "<html>Destination</html>");
        assert.equal(response.headers.get("x-middleware-rewrite"), null);
        assert.equal(response.headers.get("location"), null);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.equal(response.headers.get("cdn-cache-control"), "no-store");
        assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
        assert.equal(response.headers.get("x-custom"), "kept");
        assert.equal(response.cookies.get("first").value, "one");
        assert.equal(response.cookies.get("second").value, "two");
        assert.equal(new URL(req.url).searchParams.get("state"), state);
        assert(req.headers.get("cookie").includes(`oidc_${state}=`));
    });
}

test("callback forwarding respects basePath and strips callback parameters when returning home", async () => {
    assert.equal(
        await forwardedUrl(
            request(`/app/?code=x&state=${state}`, {
                destination: "/app/todos?sort=name#list",
                basePath: "/app"
            })
        ),
        "https://app.test/app/todos?sort=name"
    );
    assert.equal(
        await forwardedUrl(request(`/?code=x&state=${state}`, { destination: "/" })),
        "https://app.test/"
    );
});

test("ordinary requests and invalid callback destinations are left alone", async () => {
    const { proxy } = await loadProxy();
    for (const req of [
        request("/", { destination: "/account" }),
        request(`/?code=x&state=${state}`),
        request("/?code=x&state=different", { destination: "/account" }),
        request(`/account?code=x&state=${state}`, { destination: "/account" }),
        request(`/?code=x&state=${state}`, { destination: "/account", method: "POST" }),
        request(`/app/?code=x&state=${state}`, { destination: "/other", basePath: "/app" }),
        request(`/?code=x&state=${state}`, { destination: "//other.test/account" }),
        request(`/?code=x&state=${state}`, { destination: "//[" }),
        request(`/?code=x&state=${state}`, { destination: "https://other.test/account" })
    ])
        assert.equal((await proxy(req)).headers.get("x-middleware-next"), "1");
});

test("malformed unrelated OIDC cookies do not break callback rendering", async () => {
    assert.equal(
        await forwardedUrl(
            request(`/?code=x&state=${state}`, {
                destination: "/account",
                extraCookie: "oidc_invalid=123%_%ZZ"
            })
        ),
        "https://app.test/account"
    );
});

test("forwarded document headers do not carry connection, conditional or RSC state", async () => {
    const req = request(`/?code=x&state=${state}`, { destination: "/account?tab=profile" });
    for (const [name, value] of Object.entries({
        host: "app.test",
        connection: "x-connection-only",
        "x-connection-only": "private",
        "accept-encoding": "gzip",
        "if-none-match": "old-etag",
        "if-modified-since": "yesterday",
        range: "bytes=0-10",
        rsc: "1",
        "next-router-state-tree": "old-tree",
        "next-url": "/",
        "next-router-prefetch": "1",
        "accept-language": "fr",
        "x-app": "kept"
    }))
        req.headers.set(name, value);
    const { proxy } = await loadProxy(async (url, { headers }) => {
        for (const name of [
            "host",
            "connection",
            "x-connection-only",
            "accept-encoding",
            "if-none-match",
            "if-modified-since",
            "range",
            "rsc",
            "next-router-state-tree",
            "next-url",
            "next-router-prefetch"
        ])
            assert.equal(headers.get(name), null, name);
        assert.equal(headers.get("accept-language"), "fr");
        assert.equal(headers.get("x-app"), "kept");
        return new Response("decoded body", {
            headers: {
                "content-encoding": "gzip",
                "content-length": "123",
                connection: "x-connection-only",
                "x-connection-only": "private",
                "content-type": "text/html"
            }
        });
    });
    const response = await proxy(req);
    for (const name of ["content-encoding", "content-length", "connection", "x-connection-only"])
        assert.equal(response.headers.get(name), null, name);
    assert.equal(response.headers.get("content-type"), "text/html");
    assert.equal(await response.text(), "decoded body");
});

test("the internal request cannot reprocess the same callback, including a return to home", async () => {
    let calls = 0;
    const { proxy } = await loadProxy(async (url, { headers }) => {
        calls++;
        const forwarded = new NextRequest(url, { headers });
        const response = await proxy(forwarded);
        assert.equal(response.headers.get("x-middleware-next"), "1");
        return new Response("home");
    });
    await proxy(request(`/?code=x&state=${state}`, { destination: `/?state=${state}` }));
    assert.equal(calls, 1);
});

test("destination redirects and error responses retain their status and headers", async () => {
    for (const status of [307, 404, 500]) {
        const { proxy } = await loadProxy(
            async () =>
                new Response("app response", {
                    status,
                    headers: { location: "other", "x-app": "kept" }
                })
        );
        const response = await proxy(
            request(`/?code=x&state=${state}`, { destination: "/account/settings" })
        );
        assert.equal(response.status, status);
        assert.equal(response.headers.get("location"), "https://app.test/account/other");
        assert.equal(response.headers.get("x-app"), "kept");
        assert.equal(await response.text(), "app response");
    }
});

test("request extraction restores Next Route Handler base paths without changing other request URLs", async () => {
    const { extractRequestAuthContext } = await load(
        'export { extractRequestAuthContext } from "./src/server/extractRequestAuthContext";',
        { globals: { process: { env: { __NEXT_ROUTER_BASEPATH: "/app" } } } }
    );
    const headers = { Authorization: "DPoP token", DPoP: "proof" };
    const cases = [
        [
            new NextRequest("http://internal.test/api/todos?filter=active", { headers }),
            "http://internal.test/app/api/todos"
        ],
        [
            new NextRequest("http://internal.test/app/api/todos", { headers }),
            "http://internal.test/app/app/api/todos"
        ],
        [
            new NextRequest("http://internal.test/app/api/todos?filter=active", {
                headers,
                nextConfig: { basePath: "/app" }
            }),
            "http://internal.test/app/api/todos"
        ],
        [
            new Request("http://internal.test/api/todos?filter=active", { headers }),
            "http://internal.test/api/todos"
        ],
        [
            { raw: new NextRequest("http://internal.test/api/todos", { headers }) },
            "http://internal.test/app/api/todos"
        ],
        [
            {
                url: "/api/todos",
                method: "GET",
                socket: {},
                headers: { host: "internal.test", authorization: "DPoP token", dpop: "proof" }
            },
            "http://internal.test/api/todos"
        ]
    ];
    for (const [request, expectedHtu] of cases) {
        const context = extractRequestAuthContext({ request, trustProxy: false });
        assert.equal(context.isWellFormed, true);
        assert.equal(context.accessTokenAndMetadata.expectedHtu, expectedHtu);
        assert.strictEqual(extractRequestAuthContext({ request, trustProxy: false }), context);
    }
});

test("Next base path restoration preserves proxy policy and metadata memoization", async () => {
    const { extractRequestAuthContext } = await load(
        'export { extractRequestAuthContext } from "./src/server/extractRequestAuthContext";',
        { globals: { process: { env: { __NEXT_ROUTER_BASEPATH: "/app" } } } }
    );
    const request = new NextRequest("http://internal.test/api/todos?filter=active", {
        headers: {
            Authorization: "DPoP token",
            DPoP: "proof",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-Host": "public.test"
        }
    });
    const trusted = extractRequestAuthContext({ request, trustProxy: true });
    const untrusted = extractRequestAuthContext({ request, trustProxy: false });
    assert.equal(trusted.accessTokenAndMetadata.expectedHtu, "https://public.test/app/api/todos");
    assert.equal(untrusted.accessTokenAndMetadata.expectedHtu, "http://internal.test/app/api/todos");
    assert.strictEqual(extractRequestAuthContext({ request, trustProxy: true }), trusted);
    assert.notStrictEqual(trusted, untrusted);
    assert.equal(new URL(request.url).pathname, "/api/todos");
});

test("Next requests without a configured base path retain their URL", async () => {
    const { extractRequestAuthContext } = await load(
        'export { extractRequestAuthContext } from "./src/server/extractRequestAuthContext";',
        { globals: { process: { env: {} } } }
    );
    const request = new NextRequest("https://public.test/api/todos", {
        headers: { Authorization: "DPoP token", DPoP: "proof" }
    });
    const context = extractRequestAuthContext({ request, trustProxy: false });
    assert.equal(context.accessTokenAndMetadata.expectedHtu, "https://public.test/api/todos");
});

async function project(t, { src = false, typescript = true } = {}) {
    const root = await mkdtemp(join(tmpdir(), "oidc-spa-next-proxy-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, src ? "src/app" : "app"), { recursive: true });
    if (typescript) await writeFile(join(root, "tsconfig.json"), "{}");
    return root;
}

const generationParams = projectRoot => ({
    projectRoot,
    nextConfig: {},
    proxy: undefined,
    isDev: false
});

test("proxy generation writes an ignored literal config once and preserves existing ignore rules", async t => {
    const root = await project(t);
    await writeFile(join(root, ".gitignore"), "/node_modules\n");
    await writeFile(join(root, ".prettierignore"), "/build\n");
    await generateProxy(generationParams(root));
    const file = join(root, "proxy.ts");
    const before = await stat(file, { bigint: true });
    const source = await readFile(file, "utf8");
    assert(source.startsWith("// Generated by oidc-spa/nextjs-plugin."));
    assert(source.includes("/* eslint-disable */"));
    assert(source.includes("// @ts-nocheck"));
    assert(source.includes("// noinspection JSUnusedGlobalSymbols"));
    assert(source.includes("// @formatter:off"));
    assert(source.includes('withOidcSpa(nextConfig, { proxy: "./my-proxy.ts" })'));
    assert(source.includes('"source": "/"'));
    assert(source.includes('"key": "state"'));
    assert(source.includes('export { proxy } from "oidc-spa/nextjs-plugin/proxy"'));
    await generateProxy(generationParams(root));
    const after = await stat(file, { bigint: true });
    assert.equal(after.ino, before.ino);
    assert.equal(after.mtimeNs, before.mtimeNs);
    const ignore = await readFile(join(root, ".gitignore"), "utf8");
    assert(ignore.startsWith("/node_modules\n"));
    assert.equal(ignore.split("/proxy.ts").length - 1, 1);
    const prettierIgnore = await readFile(join(root, ".prettierignore"), "utf8");
    assert(prettierIgnore.startsWith("/build\n"));
    assert.equal(prettierIgnore.split("/proxy.ts").length - 1, 1);
});

test("proxy generation supports src projects and custom page extensions without requiring TypeScript", async t => {
    const root = await project(t, { src: true, typescript: false });
    await generateProxy({ ...generationParams(root), nextConfig: { pageExtensions: ["page.js"] } });
    assert((await readFile(join(root, "src/proxy.page.js"), "utf8")).includes("export const config"));
    assert((await readFile(join(root, ".gitignore"), "utf8")).includes("/src/proxy.page.js"));
});

for (const name of ["proxy.ts", "middleware.ts"]) {
    test(`proxy generation refuses to overwrite an existing ${name}`, async t => {
        const root = await project(t);
        const original = "export default function userProxy() {}\n";
        await writeFile(join(root, name), original);
        await assert.rejects(generateProxy(generationParams(root)), /Rename it.*proxy:/);
        assert.equal(await readFile(join(root, name), "utf8"), original);
    });
}

test("proxy generation preserves a custom proxy's config and compiles its original matchers", async t => {
    const root = await project(t);
    const original = `export default function custom() {}
        export const config = {
            matcher: [{ source: '/private/:path*', has: [{ type: 'header', key: 'x-allow', value: 'yes' }] }],
            regions: ['iad1']
        };`;
    await writeFile(join(root, "my-proxy.ts"), original);
    await generateProxy({
        ...generationParams(root),
        nextConfig: { basePath: "/app" },
        proxy: "./my-proxy.ts"
    });
    const source = await readFile(join(root, "proxy.ts"), "utf8");
    assert(source.includes('import * as userProxy from "./my-proxy"'));
    assert(source.includes("withOidcSpaProxy(userProxy,"));
    assert(source.includes('"source": "/private/:path*"'));
    assert(source.includes('"regexp":'));
    assert(source.includes('"iad1"'));
    assert.equal(await readFile(join(root, "my-proxy.ts"), "utf8"), original);
    await assert.rejects(
        generateProxy({ ...generationParams(root), proxy: "./proxy.ts" }),
        /separate module/
    );
});

test("custom proxy matcher edits regenerate the literal config during development", async t => {
    const root = await project(t);
    const userFile = join(root, "my-proxy.ts");
    const params = { ...generationParams(root), proxy: "./my-proxy.ts", isDev: true };
    t.after(() => unwatchFile(userFile));
    await writeFile(
        userFile,
        "export const config = { matcher: '/before' }; export default function proxy() {}"
    );
    await generateProxy(params);
    await writeFile(
        userFile,
        "export const config = { matcher: '/after' }; export default function proxy() {}"
    );
    for (let attempt = 0; attempt < 60; attempt++) {
        const source = await readFile(join(root, "proxy.ts"), "utf8");
        if (source.includes('"source": "/after"')) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail("custom matcher edit was not propagated");
});

test("plugin supports async configs and only generates proxies during development and builds", async () => {
    const phases = [];
    const generations = [];
    const { withOidcSpa } = await load('export { withOidcSpa } from "./src/nextjs-plugin";', {
        stubs: { "./generateProxy": "export async function generateProxy(params) { record(params); }" },
        globals: { record: params => generations.push(params) }
    });
    const wrapped = withOidcSpa(
        async phase => {
            phases.push(phase);
            return { basePath: "/app" };
        },
        { projectRoot: "/project" }
    );
    for (const phase of [
        "phase-production-server",
        "phase-development-server",
        "phase-production-build"
    ]) {
        const config = await wrapped(phase, { defaultConfig: {} });
        assert.equal(config.env.OIDC_SPA_NEXTJS_BASE_URL, "/app/");
    }
    assert.equal(phases.length, 3);
    assert.equal(generations.length, 2);
    assert.equal(generations[0].isDev, true);
    assert.equal(generations[1].isDev, false);
    assert.equal(generations[0].projectRoot, "/project");
});

test("custom proxy runs once on the forwarded destination and preserves normal Next responses", async () => {
    const req = request(`/app/?code=x&state=${state}`, {
        destination: "/app/private?tab=profile#details",
        basePath: "/app"
    });
    const pending = [];
    const event = { waitUntil: promise => pending.push(promise) };
    let calls = 0;
    const { withOidcSpaProxy } = await loadProxy(async (url, { headers }) => {
        const response = await wrapped(
            new NextRequest(url, { headers, nextConfig: { basePath: "/app" } }),
            event
        );
        assert.equal(response.headers.get("x-middleware-next"), "1");
        assert.equal(response.headers.get("x-middleware-request-x-user"), "alice");
        // Next applies continuation/request overrides and renders the destination.
        const responseHeaders = new Headers({ "x-custom": response.headers.get("x-custom") });
        for (const { name, value } of response.cookies.getAll())
            responseHeaders.append("set-cookie", `${name}=${value}; Path=/`);
        return new Response("rendered destination", { headers: responseHeaders });
    });
    const wrapped = withOidcSpaProxy(async (request_user, event_user) => {
        calls++;
        assert.equal(request_user.url, "https://app.test/app/private?tab=profile");
        assert.equal(request_user.nextUrl.pathname, "/private");
        assert.equal(request_user.nextUrl.basePath, "/app");
        assert.strictEqual(event_user, event);
        event_user.waitUntil(Promise.resolve());
        const headers = new Headers(request_user.headers);
        headers.set("x-user", "alice");
        const response = NextResponse.next({ request: { headers } });
        response.headers.set("x-custom", "kept");
        response.cookies.set("first", "one");
        response.cookies.set("second", "two");
        return response;
    });
    const response = await wrapped(req, event);
    assert.equal(calls, 1);
    assert.equal(response.headers.get("x-middleware-rewrite"), null);
    assert.equal(response.headers.get("x-custom"), "kept");
    assert.equal(response.cookies.get("first").value, "one");
    assert.equal(response.cookies.get("second").value, "two");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(await response.text(), "rendered destination");
    assert.equal(pending.length, 1);
    await Promise.all(pending);
});

test("custom redirects, rewrites and terminal responses remain unchanged on ordinary requests", async () => {
    const { withOidcSpaProxy } = await loadProxy();
    const original = request("/ordinary");
    for (const response of [
        NextResponse.redirect("https://app.test/denied"),
        NextResponse.rewrite("https://app.test/localized"),
        new Response("Denied", { status: 403 }),
        NextResponse.next()
    ]) {
        const wrapped = withOidcSpaProxy({
            default: req => {
                assert.strictEqual(req, original);
                return response;
            }
        });
        assert.strictEqual(await wrapped(original, {}), response);
    }
});

test("custom matchers apply to the forwarded destination, including headers, queries and cookies", async () => {
    let calls = 0;
    const { withOidcSpaProxy } = await loadProxy(async (url, { headers }) => {
        const response = await wrapped(new NextRequest(url, { headers }), {});
        return new Response("destination", { headers: response.headers });
    });
    const wrapped = withOidcSpaProxy(() => {
        calls++;
    }, [
        {
            regexp: "^/private$",
            originalSource: "/private",
            has: [
                { type: "header", key: "x-allow", value: "yes" },
                { type: "query", key: "tab", value: "profile" }
            ],
            missing: [{ type: "cookie", key: "skip" }]
        }
    ]);
    const callback = request(`/?code=x&state=${state}`, { destination: "/private?tab=profile" });
    callback.headers.set("x-allow", "yes");
    await wrapped(callback, {});
    assert.equal(calls, 1);
    await wrapped(request(`/?code=x&state=${state}`, { destination: "/public" }), {});
    callback.headers.set("cookie", `${callback.headers.get("cookie")}; skip=yes`);
    await wrapped(new NextRequest(callback.url, { headers: callback.headers }), {});
    await wrapped(request("/private?tab=profile"), {});
    assert.equal(calls, 1);
});
