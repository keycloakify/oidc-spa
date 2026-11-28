import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { configureTanstackStartPreview } from "../../dist/esm/vite-plugin/tanstack-start/configurePreviewServer.mjs";

const example = fileURLToPath(new URL("../../examples/tanstack-start/", import.meta.url));
const shell = "<!doctype html><html><body>NEUTRAL SHELL</body></html>";
const home = "<!doctype html><html><body>PRERENDERED HOME</body></html>";
const page = "<!doctype html><html><body>PRERENDERED PRICING</body></html>";

async function fixture(
    t,
    { base = "/", preset = "netlify", spa = true, nitro = true, built = true } = {}
) {
    const root = await mkdtemp(join(tmpdir(), "oidc-spa-preview-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "node_modules/.nitro"), { recursive: true });
    if (nitro) await symlink(join(example, "node_modules/nitro"), join(root, "node_modules/nitro"));
    const output = join(root, "selected-build");
    const publicDir = join(root, "frontend");
    const files = {
        [`${base}index.html`]: preset === "cloudflare-module" && base === "/" ? shell : home,
        [`${base}pricing/index.html`]: page,
        [`${base}assets/app.js`]: "console.log('STATIC JS');",
        [`${base}site.webmanifest`]: '{"name":"test"}',
        [`${base}openid-callback/index.html`]: "THIS MUST NOT OVERRIDE THE CALLBACK SHELL",
        ...(spa ? { [`${base}_shell.html`]: shell } : {}),
        ...(preset === "cloudflare-module" && base === "/" ? { "/_prerendered-index.html": home } : {})
    };
    for (const [path, contents] of Object.entries(files)) {
        const target = join(publicDir, path);
        await mkdir(join(target, ".."), { recursive: true });
        await writeFile(target, contents);
    }
    if (built) {
        await mkdir(output);
        await writeFile(
            join(output, "nitro.json"),
            JSON.stringify({ preset, publicDir: "../frontend" })
        );
        await writeFile(
            join(root, "node_modules/.nitro/last-build.json"),
            JSON.stringify({ outputDir: output })
        );
    }
    // Other build targets coexist. Preview must use the selected build, not dist/.
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist/_shell.html"), "STALE BUILD");
    const middlewares = [];
    await configureTanstackStartPreview(
        {
            config: { root, base },
            middlewares: {
                use: middleware => middlewares.push(middleware)
            }
        },
        "/openid-callback/"
    );
    const forwarded = [];
    const server = createServer((req, res) => {
        let index = 0;
        const next = error => {
            if (error) {
                res.statusCode = 500;
                res.end(String(error));
                return;
            }
            if (middlewares[index]) return middlewares[index++](req, res, next);
            forwarded.push({ url: req.url, method: req.method });
            res.end(`BACKEND ${req.method} ${req.url}`);
        };
        next();
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(
        () =>
            new Promise(resolve => {
                server.closeAllConnections();
                server.close(resolve);
            })
    );
    const origin = `http://127.0.0.1:${server.address().port}`;
    return {
        forwarded,
        request: (path, options) => fetch(origin + path, { redirect: "manual", ...options })
    };
}

for (const base of ["/", "/dashboard/"]) {
    for (const preset of ["vercel", "netlify", "cloudflare-module"]) {
        test(`preview serves static SPA output before SSR: ${preset} ${base}`, async t => {
            const f = await fixture(t, { base, preset });
            for (const [path, expected] of [
                [base, home],
                [base + "?state=b2lkYy1zcGEuexample", home],
                [base + "pricing", page],
                [base + "pricing/", page],
                [base + "openid-callback/", shell],
                [base + "openid-callback/?state=example&code=example", shell],
                [base + "not-prerendered", shell],
                [base + "apiary", shell],
                [base + "assets/app.js", "console.log('STATIC JS');"],
                [base + "site.webmanifest", '{"name":"test"}']
            ]) {
                const response = await f.request(path);
                assert.equal(response.status, 200, path);
                assert.equal(response.headers.get("location"), null, path);
                assert.equal(await response.text(), expected, path);
            }
            const head = await f.request(base + "openid-callback/", { method: "HEAD" });
            assert.equal(head.status, 200);
            assert.match(head.headers.get("content-type"), /text\/html/);
            assert.equal(await head.text(), "");
            assert.equal(f.forwarded.length, 0, "frontend requests must never reach SSR");
            for (const method of ["GET", "POST"]) {
                for (const path of ["api", "api/probe?kept=1", "_serverFn", "_serverFn/probe"]) {
                    const response = await f.request(base + path, { method });
                    assert.equal(await response.text(), `BACKEND ${method} ${base}${path}`);
                }
            }
            if (base !== "/") {
                assert.match(await (await f.request("/outside-app")).text(), /^BACKEND/);
            }
        });
    }
}

for (const options of [{ spa: false }, { built: false }, { nitro: false }]) {
    test(`preview without a selected Nitro SPA build leaves handling unchanged: ${JSON.stringify(
        options
    )}`, async t => {
        const f = await fixture(t, options);
        for (const path of ["/", "/openid-callback/", "/not-prerendered"]) {
            assert.equal(await (await f.request(path)).text(), `BACKEND GET ${path}`);
        }
    });
}
