import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { createServer } from "node:http";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Run after building oidc-spa. Build isolated apps with the example's installed
// dependencies; never modify its sources, environment, storage, or build output.
for (const method of ["offline JWT validation", "introspection endpoint"]) {
    test(`TanStack Start authentication: ${method}`, async t => {
        const repo = fileURLToPath(new URL("../../", import.meta.url));
        const example = join(repo, "examples/tanstack-start");
        const fixture = await mkdtemp(join(tmpdir(), "oidc-spa-auth-integration-"));
        const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
        const jwk = {
            ...keys.publicKey.export({ format: "jwk" }),
            kid: "audit",
            alg: "RS256",
            use: "sig"
        };
        let discoveryCalls = 0;
        let introspectionCalls = 0;
        const tokens = new Map();
        const idp = createServer(async (req, res) => {
            res.setHeader("content-type", "application/json");
            if (req.url === "/introspect") {
                introspectionCalls++;
                assert.equal(
                    req.headers.authorization,
                    `Basic ${Buffer.from("audit-api:audit-secret").toString("base64")}`
                );
                let body = "";
                for await (const chunk of req) body += chunk;
                const claims = tokens.get(new URLSearchParams(body).get("token"));
                res.end(
                    JSON.stringify(
                        claims === undefined ? { active: false } : { ...claims, active: true }
                    )
                );
                return;
            }
            if (req.url !== "/jwks") discoveryCalls++;
            res.end(
                JSON.stringify(
                    req.url === "/jwks"
                        ? { keys: [jwk] }
                        : { jwks_uri: `${issuer}/jwks`, introspection_endpoint: `${issuer}/introspect` }
                )
            );
        });
        await new Promise(resolve => idp.listen(0, "127.0.0.1", resolve));
        const issuer = `http://127.0.0.1:${idp.address().port}`;

        try {
            const { runWithStartContext } = await import(
                pathToFileURL(
                    join(example, "node_modules/@tanstack/start-storage-context/dist/esm/index.js")
                )
            );
            const { serverFnFetcher } = await import(
                pathToFileURL(
                    join(
                        example,
                        "node_modules/@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js"
                    )
                )
            );
            let fetches = 0;
            await runWithStartContext({ startOptions: {} }, () =>
                Promise.all([
                    serverFnFetcher("http://localhost/_serverFn/test", [{ method: "GET" }], async () => {
                        fetches++;
                        return Response.json({ ok: true });
                    }),
                    serverFnFetcher("http://localhost/_serverFn/test", [{ method: "GET" }], async () => {
                        fetches++;
                        return Response.json({ ok: true });
                    })
                ])
            );
            assert.equal(fetches, 2);
            await mkdir(join(fixture, "src/routes/api"), { recursive: true });
            await mkdir(join(fixture, "node_modules"));
            for (const name of ["package.json", "tsconfig.json"])
                await cp(join(example, name), join(fixture, name));
            for (const name of await readdir(join(example, "node_modules"))) {
                if (name.startsWith(".") || name === "oidc-spa") continue;
                await symlink(join(example, "node_modules", name), join(fixture, "node_modules", name));
            }
            await cp(join(repo, "dist"), join(fixture, "node_modules/oidc-spa"), { recursive: true });
            const pkg = JSON.parse(
                await readFile(join(fixture, "node_modules/oidc-spa/package.json"), "utf8")
            );
            const aliases = Object.entries(pkg.exports)
                .filter(([, entry]) => entry.import)
                .map(([name, entry]) => ({
                    find: name.replace(/^\./, "oidc-spa"),
                    replacement: join(fixture, "node_modules/oidc-spa", entry.import)
                }))
                .sort((a, b) => b.find.length - a.find.length);
            await writeFile(
                join(fixture, "vite.config.ts"),
                `
        import { defineConfig } from "vite";
        import { tanstackStart } from "@tanstack/react-start/plugin/vite";
        import react from "@vitejs/plugin-react";
        import { nitro } from "nitro/vite";
        import { oidcSpa } from "oidc-spa/vite-plugin";
        export default defineConfig({ resolve: { tsconfigPaths: true, alias: ${JSON.stringify(
            aliases
        )} },
            plugins: [tanstackStart(), react(), nitro(), oidcSpa()] });
    `
            );
            await writeFile(
                join(fixture, "src/router.tsx"),
                `
        import { createRouter } from "@tanstack/react-router";
        import { routeTree } from "./routeTree.gen";
        export const getRouter = () => createRouter({ routeTree });
    `
            );
            await writeFile(
                join(fixture, "src/routes/__root.tsx"),
                `
        import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
        export const Route = createRootRoute({ shellComponent: ({ children }) =>
            <html><head><HeadContent /></head><body>{children}<Scripts /></body></html> });
    `
            );
            await writeFile(
                join(fixture, "src/routes/index.tsx"),
                `
        import { createFileRoute } from "@tanstack/react-router";
        import { single, reused, layered, admin, parallel } from "../functions";
        export const Route = createFileRoute("/")({ component: () => <div>
            <button onClick={() => single()}>Single</button>
            <button onClick={() => reused()}>Reused</button>
            <button onClick={() => layered()}>Layered</button>
            <button onClick={() => admin()}>Admin</button>
            <button onClick={() => parallel()}>Parallel</button>
        </div> });
    `
            );
            await writeFile(
                join(fixture, "src/oidc.ts"),
                `
        import { oidcSpa } from "oidc-spa/react-tanstack-start";
        export let runtimeConfigCalls = 0;
        export const { oidcFnMiddleware, oidcRequestMiddleware } = oidcSpa
            .withClientUser(({ idTokenClaims }) => ({ id: idTokenClaims.sub }))
            .withServerUser(({ accessTokenClaims }) => ({ id: accessTokenClaims.sub,
                isAdmin: accessTokenClaims.roles?.includes("admin") ?? false }))
            .withRuntimeConfigs(({ process }) => {
                runtimeConfigCalls++;
                return { mode: "real", issuerUri: process.env.AUDIT_ISSUER,
                    client: { clientId: "audit" }, server: ${JSON.stringify(
                        method === "offline JWT validation"
                            ? {
                                  accessTokenValidationMethod: method,
                                  expectedAccessTokenAudience: "audit"
                              }
                            : {
                                  accessTokenValidationMethod: method,
                                  clientId: "audit-api",
                                  clientSecret: "audit-secret"
                              }
                    )} };
            }).createUtils();
    `
            );
            // A global optional request middleware and function-specific middleware must
            // share validation while retaining the function's stricter requirements.
            await writeFile(
                join(fixture, "src/start.ts"),
                `
        import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";
        import { oidcRequestMiddleware } from "./oidc";
        const optional = oidcRequestMiddleware();
        export const startInstance = createStart(() => ({ requestMiddleware: [
            createCsrfMiddleware({ filter: ctx => ctx.handlerType === "serverFn" }),
            createMiddleware().server(options => {
                if (new URL(options.request.url).searchParams.has("skipRequestAuth")) return options.next();
                return optional.options.server(options);
            })
        ] }));
    `
            );
            await writeFile(
                join(fixture, "src/functions.ts"),
                `
        import { createServerFn, createMiddleware } from "@tanstack/react-start";
        import { oidcFnMiddleware } from "./oidc";
        const shared = oidcFnMiddleware({ require: "authed request" });
        export const single = createServerFn({ method: "GET" }).middleware([shared])
            .handler(({ context }) => ({ id: context.oidc.user.id }));
        export const reused = createServerFn({ method: "GET" }).middleware([shared, shared])
            .handler(({ context }) => ({ id: context.oidc.user.id }));
        export const layered = createServerFn({ method: "GET" }).middleware([
            oidcFnMiddleware({ require: "authed request" }),
            oidcFnMiddleware({ require: "authed request" })
        ]).handler(({ context }) => ({ id: context.oidc.user.id }));
        export const admin = createServerFn({ method: "GET" }).middleware([
            shared, oidcFnMiddleware({ require: "authed request", hasAuthorization: ({ user }) => user.isAdmin })
        ]).handler(({ context }) => ({ id: context.oidc.user.id }));
        // Exercise concurrent validation under one request without the global
        // authentication middleware resolving its promise before both calls.
        export const parallel = createServerFn({ method: "GET" }).middleware([
            createMiddleware({ type: "function" }).server(async ({ next, ...options }) => {
                const results = await Promise.all([0, 1].map(() => shared.options.server({
                    ...options, next: ({ context }) => context
                })));
                return next({ context: results[0] });
            })
        ]).handler(({ context }) => ({ id: context.oidc.user.id }));
    `
            );
            for (const name of ["single", "layered", "admin", "required", "anonymous"]) {
                const middleware =
                    name === "layered"
                        ? `oidcRequestMiddleware({ require: "authed request" }), oidcRequestMiddleware({ require: "authed request" })`
                        : name === "admin"
                        ? `oidcRequestMiddleware({ require: "authed request", hasAuthorization: ({ user }) => user.isAdmin })`
                        : name === "required"
                        ? `oidcRequestMiddleware(), oidcRequestMiddleware({ require: "authed request" })`
                        : name === "anonymous"
                        ? `oidcRequestMiddleware()`
                        : `oidcRequestMiddleware({ require: "authed request" })`;
                await writeFile(
                    join(fixture, `src/routes/api/${name}.ts`),
                    `
            import { createFileRoute } from "@tanstack/react-router";
            import { oidcRequestMiddleware } from "../../oidc";
            export const Route = createFileRoute("/api/${name}")({ server: {
                middleware: [${middleware}], handlers: { GET: ({ context }) => Response.json({ id: context.oidc.user?.id ?? null }) }
            } });
        `
                );
            }
            // Ensure the server functions are included without executing them during SSR.
            await writeFile(
                join(fixture, "src/routes/api/manifest.ts"),
                `
        import { createFileRoute } from "@tanstack/react-router";
        import { single, reused, layered, admin, parallel } from "../../functions";
        import { runtimeConfigCalls } from "../../oidc";
        export const Route = createFileRoute("/api/manifest")({ server: { handlers: {
            GET: () => Response.json({ runtimeConfigCalls, functions: Object.fromEntries(
                Object.entries({ single, reused, layered, admin, parallel }).map(([name, fn]) => [name, fn.url])) })
        } } });
    `
            );
            await promisify(execFile)(
                process.execPath,
                [join(example, "node_modules/vite/bin/vite.js"), "build"],
                {
                    cwd: fixture,
                    env: { ...process.env, AUDIT_ISSUER: issuer },
                    maxBuffer: 10_000_000
                }
            ).catch(error => {
                console.error(error.stdout, error.stderr);
                throw error;
            });
            const previousIssuer = process.env.AUDIT_ISSUER;
            process.env.AUDIT_ISSUER = issuer;
            t.after(() =>
                previousIssuer === undefined
                    ? delete process.env.AUDIT_ISSUER
                    : (process.env.AUDIT_ISSUER = previousIssuer)
            );
            const ssr = await import(pathToFileURL(join(fixture, ".output/server/_ssr/ssr.mjs")));
            const server = ssr.default ?? ssr.ssr_exports?.default;
            const { functions } = await (
                await server.fetch(new Request("http://localhost/api/manifest"))
            ).json();
            const proofKeys = generateKeyPairSync("ec", { namedCurve: "P-256" });
            const proofJwk = proofKeys.publicKey.export({ format: "jwk" });
            const jkt = createHash("sha256")
                .update(
                    JSON.stringify({
                        crv: proofJwk.crv,
                        kty: proofJwk.kty,
                        x: proofJwk.x,
                        y: proofJwk.y
                    })
                )
                .digest("base64url");
            const jwt = (header, payload, key, ec = false) => {
                const unsigned = [header, payload]
                    .map(value => Buffer.from(JSON.stringify(value)).toString("base64url"))
                    .join(".");
                return `${unsigned}.${sign(
                    "sha256",
                    Buffer.from(unsigned),
                    ec ? { key, dsaEncoding: "ieee-p1363" } : key
                ).toString("base64url")}`;
            };
            const now = Math.floor(Date.now() / 1000);
            const token = roles => {
                const claims = {
                    iss: issuer,
                    aud: "audit",
                    sub: "audit-user",
                    roles,
                    iat: now,
                    exp: now + 300,
                    cnf: { jkt }
                };
                const accessToken = jwt({ alg: "RS256", kid: "audit" }, claims, keys.privateKey);
                tokens.set(accessToken, claims);
                return accessToken;
            };
            const accessToken = token([]);
            const adminToken = token(["admin"]);
            const proof = (url, accessToken) =>
                jwt(
                    { alg: "ES256", typ: "dpop+jwt", jwk: proofJwk },
                    {
                        htm: "GET",
                        htu: url.split("?")[0],
                        ath: createHash("sha256").update(accessToken).digest("base64url"),
                        iat: Math.floor(Date.now() / 1000),
                        jti: randomUUID()
                    },
                    proofKeys.privateKey,
                    true
                );
            const request = (url, token = accessToken, dpop = proof(url, token)) =>
                server.fetch(
                    new Request(url, {
                        headers: {
                            Authorization: `DPoP ${token}`,
                            DPoP: dpop,
                            Accept: "application/json",
                            "Sec-Fetch-Site": "same-origin",
                            "x-tsr-serverfn": "true"
                        }
                    })
                );
            for (const [kind, endpoints] of [
                [
                    "request middleware",
                    {
                        single: "/api/single",
                        layered: "/api/layered",
                        required: "/api/required",
                        admin: "/api/admin"
                    }
                ],
                ["function middleware", functions]
            ]) {
                for (const [name, path] of Object.entries(endpoints)) {
                    await t.test(`${kind}: ${name}`, async () => {
                        const requestUrl = new URL(path, "http://localhost");
                        if (name === "parallel") requestUrl.searchParams.set("skipRequestAuth", "1");
                        const url = requestUrl.href;
                        const token = name === "admin" ? adminToken : accessToken;
                        const dpop = proof(url, token);
                        const before = introspectionCalls;
                        const first = await request(url, token, dpop);
                        assert.equal(first.status, 200);
                        assert.match(await first.text(), /audit-user/);
                        if (method === "introspection endpoint")
                            assert.equal(introspectionCalls - before, 1);
                        const replay = await request(url, token, dpop);
                        assert.equal(replay.status, 401);
                        await replay.text();
                        const fresh = await request(url, token);
                        assert.equal(fresh.status, 200);
                        await fresh.text();
                        if (name === "admin") {
                            const forbidden = await request(url);
                            assert.equal(forbidden.status, 403);
                            await forbidden.text();
                        }
                        const missing = await server.fetch(
                            new Request(url, {
                                headers: {
                                    "Sec-Fetch-Site": "same-origin",
                                    "x-tsr-serverfn": "true",
                                    Accept: "application/json"
                                }
                            })
                        );
                        assert.equal(missing.status, 401);
                        await missing.text();
                    });
                }
            }
            const anonymous = await server.fetch(new Request("http://localhost/api/anonymous"));
            assert.equal(anonymous.status, 200);
            assert.deepEqual(await anonymous.json(), { id: null });
            const invalid = await request("http://localhost/api/single", accessToken, "invalid");
            await invalid.text();
            const stats = await (
                await server.fetch(new Request("http://localhost/api/manifest"))
            ).json();
            assert.equal(stats.runtimeConfigCalls, 1);
            assert.equal(discoveryCalls, 1);
            assert.equal(invalid.status, 401);
        } finally {
            idp.closeAllConnections();
            await new Promise(resolve => idp.close(resolve));
            await rm(fixture, { recursive: true, force: true });
        }
    });
}
