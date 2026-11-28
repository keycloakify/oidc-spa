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

test("packaged plugin detects SPA output across rebuilds and either Nitro plugin order", async t => {
    // Reuse the same project and output directory: a previous SPA build must not
    // cause the next SSR build to inherit its shell or CDN routing.
    const root = await mkdtemp(join(tmpdir(), "oidc-spa-vercel-build-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    for (const name of ["src", "public", "package.json", "tsconfig.json", ".env"]) {
        await cp(join(example, name), join(root, name), { recursive: true });
    }
    await mkdir(join(root, "node_modules"));
    for (const name of await readdir(join(example, "node_modules"))) {
        if (name.startsWith(".") || name === "oidc-spa") continue;
        await symlink(join(example, "node_modules", name), join(root, "node_modules", name));
    }
    await cp(join(repository, "dist"), join(root, "node_modules/oidc-spa"), { recursive: true });

    let baselineRoutes;
    for (const mode of [
        "ssr",
        "nitro-first",
        "ssr-after-spa",
        "ssr-prerender",
        "oidc-first",
        "ssr-home",
        "spa-base",
        "spa-home-rejected"
    ]) {
        await t.test(mode, async t => {
            const spa = mode === "nitro-first" || mode === "oidc-first" || mode.startsWith("spa-");
            const base = mode === "spa-base" ? "/dashboard/" : "/";
            const shellPath = base + "_shell.html";
            const prerender = spa || mode === "ssr-prerender";
            const oidcPlugin = `oidcSpa({redirectUriPath:${JSON.stringify(
                mode.includes("home") ? "/" : "/openid-callback/"
            )},enableRoutingCookie:${!spa}})`;
            const plugins =
                mode === "oidc-first"
                    ? `${oidcPlugin}, nitro({ preset: "vercel" })`
                    : `nitro({ preset: "vercel" }), ${oidcPlugin}`;
            await writeFile(
                join(root, "vite.config.ts"),
                `import { defineConfig } from "vite";
                import { tanstackStart } from "@tanstack/react-start/plugin/vite";
                import react from "@vitejs/plugin-react";
                import { nitro } from "nitro/vite";
                import { oidcSpa } from "oidc-spa/vite-plugin";
                export default defineConfig({
                    base: ${JSON.stringify(base)},
                    resolve: { tsconfigPaths: true, dedupe: ["oidc-spa"] },
                    plugins: [
                        tanstackStart({
                            prerender: { enabled: ${prerender} },
                            spa: { enabled: ${spa}, maskPath: "/?__spa_shell" }
                        }),
                        ${plugins}, react()
                    ],
                    preview: { host: "127.0.0.1" }
                });`
            );
            try {
                await promisify(execFile)(
                    process.execPath,
                    [join(example, "node_modules/vite/bin/vite.js"), "build"],
                    {
                        cwd: root,
                        env: { ...process.env, OIDC_PROVIDER: "mock" },
                        maxBuffer: 10_000_000
                    }
                );
            } catch (error) {
                if (mode === "spa-home-rejected") {
                    assert.match(
                        error.stdout + error.stderr,
                        /static SPA routing requires a dedicated redirectUriPath.*openid-callback/s
                    );
                    return;
                }
                throw new Error(`Vercel ${mode} build failed:\n${error.stdout}\n${error.stderr}`, {
                    cause: error
                });
            }
            assert.notEqual(mode, "spa-home-rejected", "home callback SPA must reject the build");
            const output = join(root, ".vercel/output");
            const config = JSON.parse(await readFile(join(output, "config.json"), "utf8"));
            if (!spa) {
                assert.equal(
                    config.routes.some(route => route.dest === shellPath),
                    false
                );
                await assert.rejects(readFile(join(output, "static", base, "_shell.html")), {
                    code: "ENOENT"
                });
                if (baselineRoutes === undefined) baselineRoutes = config.routes;
                else assert.deepEqual(config.routes, baselineRoutes);
                if (prerender) {
                    assert.match(
                        await readFile(join(output, "static", base, "index.html"), "utf8"),
                        /<h1>/
                    );
                }
                return;
            }
            assert.equal(config.routes[0].dest, shellPath);
            assert.equal(config.routes[0].src, `^${base}openid-callback/$`);
            assert.equal(config.routes[0].has, undefined);
            assert.deepEqual(
                config.routes.filter(route => route.dest !== shellPath),
                baselineRoutes
            );
            const filesystemIndex = config.routes.findIndex(route => route.handle === "filesystem");
            assert.equal(config.routes[filesystemIndex + 1].dest, shellPath);
            assert.equal(
                new RegExp(config.routes[filesystemIndex + 1].src).test(base + "not-prerendered"),
                true
            );
            for (const path of ["/api", "/api/todos", "/_serverFn", "/_serverFn/example"]) {
                assert.equal(
                    new RegExp(config.routes[filesystemIndex + 1].src).test(base + path.slice(1)),
                    false
                );
            }
            assert.match(await readFile(join(output, "static", base, "index.html"), "utf8"), /<h1>/);
            const shell = await readFile(join(output, "static", base, "_shell.html"), "utf8");
            assert(!shell.includes("<h1>"), "callback shell must omit the home-page content");
            assert.match(shell, /data-oidc-spa-static/);
        });
    }
});
