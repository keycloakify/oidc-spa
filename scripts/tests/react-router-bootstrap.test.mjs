import assert from "node:assert/strict";
import { test } from "node:test";
import {
    protectReactRouterDocument,
    protectReactRouterResponse
} from "../../dist/esm/vite-plugin/reactRouterDocument.mjs";
import { parse } from "../../dist/esm/vendor/build-runtime/parse5.mjs";
import { getProjectType } from "../../dist/esm/vite-plugin/projectType.mjs";

function elements(html, tag) {
    const found = [];
    function visit(node) {
        if (node.tagName === tag) found.push(node);
        node.childNodes?.forEach(visit);
    }
    visit(parse(html));
    return found;
}
const attr = (node, name) => node.attrs.find(a => a.name === name)?.value;
const shell = `<!doctype html><html><head>
<link rel="modulepreload" href="/assets/root.js" crossorigin="anonymous">
<script nonce="a&amp;b">window.context = new ReadableStream();</script>
<script type="application/json">{"example":"<script>"}</script>
</head><body><script type="module" async nonce="a&amp;b">import "/root.js";
window.__reactRouterRouteModules = {}; import("/entry.js");</script>
<script nonce="a&amp;b">window.context.enqueue("escaped <tag> and \\u2028");</script>
<template><script>throw new Error("inert template");</script></template>
</body></html>`;

test("React Router document defers every executable script and application preload", () => {
    const output = protectReactRouterDocument(shell, "/base/bootstrap.js");
    const scripts = elements(output, "script");
    const executable = scripts.filter(s =>
        [undefined, "", "module", "text/javascript"].includes(attr(s, "type"))
    );
    assert.equal(executable.length, 1);
    assert.equal(attr(executable[0], "src"), "/base/bootstrap.js");
    assert.equal(attr(executable[0], "nonce"), "a&b");
    const deferred = scripts.filter(s => attr(s, "type") === "application/x-oidc-spa-pending");
    assert.equal(deferred.length, 3);
    assert.equal(attr(deferred[1], "data-oidc-spa-type"), "module");
    assert.equal(attr(deferred[1], "async"), "");
    assert.equal(attr(elements(output, "link")[0], "rel"), undefined);
    assert.equal(attr(elements(output, "link")[0], "data-oidc-spa-rel"), "modulepreload");
    assert(output.includes('window.context.enqueue("escaped <tag> and \\u2028");'));
    assert(output.includes('<script type="application/json">{"example":"<script>"}</script>'));
    assert(output.includes('<template><script>throw new Error("inert template");</script></template>'));
    assert.throws(() => protectReactRouterDocument(output, "/bootstrap.js"), /more than once/);
});

test("unknown document bootstraps fail instead of claiming initialization protection", () => {
    assert.throws(
        () =>
            protectReactRouterDocument(
                '<html><head></head><body><script src="/app.js"></script></body></html>',
                "/bootstrap.js"
            ),
        /Unrecognized/
    );
});

test("only HTML response bodies are rewritten and stale length/cache validators are removed", async () => {
    const data = Response.json({ private: "loader data" }, { status: 401 });
    assert.equal(await protectReactRouterResponse(data, "/bootstrap.js"), data);
    const response = await protectReactRouterResponse(
        new Response(shell, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Content-Length": "1",
                ETag: "stale",
                "X-Custom": "preserved"
            }
        }),
        "/bootstrap.js"
    );
    assert.equal(response.headers.get("Content-Length"), null);
    assert.equal(response.headers.get("ETag"), null);
    assert.equal(response.headers.get("X-Custom"), "preserved");
    assert((await response.text()).includes("/bootstrap.js"));
});

test("React Router detection does not select vanilla Vite or TanStack Start", () => {
    assert.equal(getProjectType({ pluginNames: ["vite:react-babel"] }), "other");
    assert.equal(getProjectType({ pluginNames: ["react-router:unrelated"] }), "other");
    assert.equal(getProjectType({ pluginNames: ["react-router"] }), "react-router-framework");
    assert.equal(
        getProjectType({ pluginNames: ["tanstack-react-start:config", "react-router"] }),
        "tanstack-start"
    );
});

test("legacy JavaScript MIME types cannot escape script deferral", () => {
    for (const type of [
        "text/jscript",
        "text/livescript",
        "text/javascript1.5",
        "application/x-javascript",
        "text/javascript; charset=utf-8"
    ]) {
        const html = shell.replace(
            "</head>",
            `<script type="${type}">throw new Error("early");</script></head>`
        );
        const scripts = elements(protectReactRouterDocument(html, "/bootstrap.js"), "script");
        assert(scripts.some(s => attr(s, "data-oidc-spa-type") === type));
    }
});

test("active HTML outside script tags is rejected instead of weakening the boundary", () => {
    for (const html of [
        '<img src="x" onerror="attack()">',
        '<a href="java&#10;script:attack()">link</a>',
        '<iframe srcdoc="&lt;script>attack()&lt;/script>"></iframe>',
        "<svg><script>attack()</script></svg>"
    ]) {
        assert.throws(
            () =>
                protectReactRouterDocument(shell.replace("</head>", `</head>${html}`), "/bootstrap.js"),
            /oidc-spa:/
        );
    }
    assert.doesNotThrow(() =>
        protectReactRouterDocument(
            shell.replace("</body>", '<div data-example="javascript:example"></div></body>'),
            "/bootstrap.js"
        )
    );
});
