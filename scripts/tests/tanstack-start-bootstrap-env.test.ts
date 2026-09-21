import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import type { ResolvedConfig } from "vite";
import { createHandleTanstackStartBootstrapEnv } from "../../src/vite-plugin/handleTanstackStartBootstrapEnv";

test("TanStack Start bootstrap environment manifest", async t => {
    const fixture = async (
        files: Record<string, string>,
        params: { resolveAliasInConfig?: boolean; command?: "serve" | "build" } = {}
    ) => {
        const root = await mkdtemp(path.join(tmpdir(), "oidc-spa-public-env-"));
        t.after(() => rm(root, { recursive: true, force: true }));
        for (const [name, code] of Object.entries(files)) {
            await mkdir(path.dirname(path.join(root, name)), { recursive: true });
            await writeFile(path.join(root, name), code);
        }
        const createHandler = () =>
            createHandleTanstackStartBootstrapEnv({
                resolvedConfig: {
                    root,
                    cacheDir: path.join(root, "node_modules/.vite"),
                    command: params.command ?? "serve",
                    build: { outDir: "dist" },
                    resolve: {
                        alias:
                            params.resolveAliasInConfig === false
                                ? []
                                : [{ find: "@", replacement: root }]
                    }
                } as ResolvedConfig
            });
        const handler = createHandler();
        const resolvedSpecifiers: string[] = [];
        const context = {
            addWatchFile: (_id: string) => {},
            environment: { name: "ssr" },
            resolve: async (specifier: string, importer?: string) => {
                resolvedSpecifiers.push(specifier);
                if (
                    !specifier.startsWith(".") &&
                    !specifier.startsWith("@/") &&
                    !specifier.startsWith("#/")
                )
                    return null;
                const base = specifier.startsWith("@/")
                    ? path.join(root, specifier.slice(2))
                    : specifier.startsWith("#/")
                    ? path.join(root, "src", specifier.slice(2))
                    : path.resolve(path.dirname(importer!), specifier);
                for (const id of [base, `${base}.ts`, `${base}.tsx`]) {
                    try {
                        await readFile(id);
                        return { id, external: false };
                    } catch {}
                }
                return null;
            }
        };
        const read = async (
            handler: ReturnType<typeof createHandler>,
            loadContext: Parameters<typeof handler.load>[1] = context as any
        ) => {
            const code = await handler.load(
                handler.resolveId("virtual:oidc-spa/tanstack-start-public-env")!,
                loadContext
            );
            const getSet = (exportName: string) =>
                JSON.parse(
                    code!.match(new RegExp(`export const ${exportName} = new Set\\((.*?)\\);`))![1]
                ) as string[];

            return {
                publicEnvNames: getSet("publicEnvNames"),
                toRedactEnvNames: getSet("toRedactEnvNames")
            };
        };
        const load = () => read(handler);
        return { root, handler, createHandler, context, resolvedSpecifiers, read, load };
    };
    const setup = `import { oidcSpa } from "oidc-spa/react-tanstack-start";
        const { bootstrapOidc } = oidcSpa.withAutoLogin().createUtils();`;

    await t.test("collects both conditional branches, brackets and membership checks", async () => {
        const { load } = await fixture({
            "oidc.ts": `${setup}
            bootstrapOidc(({ process }) => ({
                issuerUri: process.env.REGION === "eu" ? process.env.EU_ISSUER : process.env["US_ISSUER"],
                clientId: "CLIENT_ID" in process.env ? process.env.CLIENT_ID : "fallback"
            }));`
        });
        assert.deepEqual(await load(), {
            publicEnvNames: ["CLIENT_ID", "EU_ISSUER", "REGION", "US_ISSUER"],
            toRedactEnvNames: []
        });
    });
    await t.test(
        "recognizes renamed imports, builder aliases, callbacks and destructured env",
        async () => {
            const { load } = await fixture({
                "oidc.ts": `
            import { oidcSpa as auth } from "oidc-spa/react-tanstack-start";
            const builder = auth.withClientUser(() => ({}));
            const utilities = builder.createUtils();
            const { bootstrapOidc: boot } = utilities;
            function options({ process: p }) {
                const { env } = p;
                const { ISSUER, ["CLIENT"]: client } = env;
                return { issuerUri: ISSUER, clientId: client };
            }
            const callback = options;
            boot(callback);`
            });
            assert.deepEqual(await load(), {
                publicEnvNames: ["CLIENT", "ISSUER"],
                toRedactEnvNames: []
            });
        }
    );
    await t.test("only follows the injected bindings and the adapter's bootstrap", async () => {
        const { load } = await fixture({
            "oidc.ts": `${setup}
            const secret = process.env.SERVER_SECRET;
            function unrelated(bootstrapOidc) {
                bootstrapOidc(({ process }) => process.env.NOT_OIDC);
            }
            bootstrapOidc(({ process: p }) => {
                const ignored = (() => { const p = { env: { NOT_INJECTED: "x" } }; return p.env.NOT_INJECTED; })();
                return { clientId: p.env.CLIENT, issuerUri: p.env.ISSUER };
            });`
        });
        assert.deepEqual(await load(), {
            publicEnvNames: ["CLIENT", "ISSUER"],
            toRedactEnvNames: []
        });
    });
    await t.test(
        "follows imported bootstrap aliases through reexports, including lazy source files",
        async () => {
            const { load } = await fixture({
                "auth.ts": `import * as adapter from "oidc-spa/react-tanstack-start"; export const { bootstrapOidc: boot } = adapter.oidcSpa.createUtils();`,
                "barrel.ts": `export { boot as start } from "./auth";`,
                "routes/lazy.ts": `import { start } from "@/barrel"; start(({ process }) => ({ clientId: process.env.LAZY_CLIENT }));`
            });
            assert.deepEqual(await load(), {
                publicEnvNames: ["LAZY_CLIENT"],
                toRedactEnvNames: []
            });
        }
    );
    await t.test("follows builder reexports and tolerates circular barrels", async () => {
        const { load } = await fixture({
            "a.ts": `export * from "./b"; export { oidcSpa as auth } from "oidc-spa/react-tanstack-start";`,
            "b.ts": `export * from "./a";`,
            "oidc.ts": `import { auth } from "./a"; const { bootstrapOidc } = auth.createUtils(); bootstrapOidc(({ process }) => ({ clientId: process.env.CLIENT }));`
        });
        assert.deepEqual(await load(), { publicEnvNames: ["CLIENT"], toRedactEnvNames: [] });
    });
    await t.test("multiple instances and prototype-like names use exact membership", async () => {
        const { load } = await fixture({
            "oidc.ts": `${setup}
            const other = oidcSpa.createUtils();
            bootstrapOidc(({ process }) => ({ clientId: process.env.constructor }));
            other.bootstrapOidc(({ process }) => ({ clientId: process.env["__proto__"] }));`
        });
        assert.deepEqual(await load(), {
            publicEnvNames: ["__proto__", "constructor"],
            toRedactEnvNames: []
        });
    });
    await t.test("does not execute callbacks or read environment values at build time", async () => {
        const { load } = await fixture({
            "oidc.ts": `${setup}
            bootstrapOidc(({ process }) => {
                throw new Error("must never execute at build time");
                return { clientId: process.env.CLIENT };
            });`
        });
        assert.deepEqual(await load(), { publicEnvNames: ["CLIENT"], toRedactEnvNames: [] });
    });
    await t.test("follows aliases implemented by Vite resolver hooks", async () => {
        const { load } = await fixture(
            {
                "auth.ts": `import { oidcSpa } from "oidc-spa/react-tanstack-start"; export const { bootstrapOidc: boot } = oidcSpa.createUtils();`,
                "barrel.ts": `export { boot } from "./auth";`,
                "oidc.ts": `import { boot } from "@/barrel"; boot(({ process }) => ({ clientId: process.env.CLIENT }));`
            },
            { resolveAliasInConfig: false }
        );
        assert.deepEqual(await load(), { publicEnvNames: ["CLIENT"], toRedactEnvNames: [] });
    });
    await t.test("uses the server resolver when loaded by the client", async () => {
        const { root, handler, context, resolvedSpecifiers, read } = await fixture(
            {
                "auth.ts": `import { oidcSpa } from "oidc-spa/react-tanstack-start"; export const { bootstrapOidc: boot } = oidcSpa.withServerUser(() => ({})).createUtils();`,
                "barrel.ts": `export { boot } from "./auth";`,
                "oidc.ts": `import { boot } from "@/barrel"; boot(({ process }) => ({
                    mode: "real",
                    issuerUri: process.env.ISSUER,
                    client: { clientId: process.env.CLIENT },
                    server: { clientSecret: process.env.SECRET }
                }));`,
                "component.test.ts": `import "vitest";`
            },
            { resolveAliasInConfig: false }
        );
        const watcher = new EventEmitter();
        const httpServer = new EventEmitter();
        const serverResolvedSpecifiers: string[] = [];
        handler.configureServer({
            watcher,
            httpServer,
            environments: {
                ssr: {
                    config: { consumer: "server" },
                    pluginContainer: {
                        resolveId: async (specifier: string, importer?: string) => {
                            serverResolvedSpecifiers.push(specifier);
                            return context.resolve(specifier, importer);
                        }
                    }
                }
            }
        } as any);
        // Vite contexts have prototype methods that must retain their receiver.
        class ClientContext {
            environment = { name: "client" };
            watchedFiles = new Set<string>();
            addWatchFile(id: string) {
                assert.equal(this, clientContext);
                this.watchedFiles.add(id);
            }
            async resolve(): Promise<never> {
                throw new Error("The client resolver must not scan application imports.");
            }
        }
        const clientContext = new ClientContext();
        assert.deepEqual(await read(handler, clientContext), {
            publicEnvNames: ["CLIENT", "ISSUER"],
            toRedactEnvNames: ["SECRET"]
        });
        assert(clientContext.watchedFiles.has(path.join(root, "oidc.ts")));
        assert.deepEqual(resolvedSpecifiers.sort(), ["./auth", "@/barrel", "vitest"]);
        assert.deepEqual(serverResolvedSpecifiers.sort(), ["./auth", "@/barrel", "vitest"]);
        httpServer.emit("close");
    });
    await t.test("fails closed when the dev client has no server resolver", async () => {
        const { handler, context, read } = await fixture({
            "oidc.ts": `${setup} bootstrapOidc(({ process }) => ({ clientId: process.env.CLIENT }));`
        });
        await assert.rejects(
            () => read(handler, { ...context, environment: { name: "client" } } as any),
            /server resolver is unavailable/
        );
    });
    await t.test("uses the build resolver without a dev server", async () => {
        const { handler, context, read, resolvedSpecifiers } = await fixture(
            {
                "auth.ts": `${setup} export { bootstrapOidc };`,
                "oidc.ts": `import { bootstrapOidc } from "@/auth"; bootstrapOidc(({ process }) => ({ clientId: process.env.CLIENT }));`
            },
            { command: "build", resolveAliasInConfig: false }
        );
        assert.deepEqual(await read(handler, { ...context, environment: { name: "client" } } as any), {
            publicEnvNames: ["CLIENT"],
            toRedactEnvNames: []
        });
        assert.deepEqual(resolvedSpecifiers, ["@/auth"]);
    });
    await t.test("follows local package import mappings through the resolver", async () => {
        const { load, resolvedSpecifiers } = await fixture({
            "package.json": JSON.stringify({ imports: { "#/*": "./src/*" } }),
            "src/auth.ts": `import { oidcSpa } from "oidc-spa/react-tanstack-start"; export const { bootstrapOidc: boot } = oidcSpa.createUtils();`,
            "oidc.ts": `import { boot } from "#/auth"; boot(({ process }) => ({ clientId: process.env.CLIENT }));`,
            "test.ts": `import "vitest";`
        });
        assert.deepEqual(await load(), { publicEnvNames: ["CLIENT"], toRedactEnvNames: [] });
        assert.deepEqual(resolvedSpecifiers.sort(), ["#/auth", "vitest"]);
    });
    await t.test(
        "redacts the introspection client secret while exposing the remaining bootstrap values",
        async () => {
            const { load } = await fixture({
                "oidc.ts": `${setup}
            bootstrapOidc(({ process }) => {
            const clientSecret = process.env.INTROSPECTION_CLIENT_SECRET;
            return ({
                mode: "real",
                issuerUri: process.env.ISSUER_URI,
                server: {
                    accessTokenValidationMethod: "introspection endpoint",
                    clientId: process.env.INTROSPECTION_CLIENT_ID,
                    clientSecret
                },
                client: { clientId: process.env.CLIENT_ID }
            });
            });`
            });
            assert.deepEqual(await load(), {
                publicEnvNames: ["CLIENT_ID", "INTROSPECTION_CLIENT_ID", "ISSUER_URI"],
                toRedactEnvNames: ["INTROSPECTION_CLIENT_SECRET"]
            });
        }
    );
    for (const expression of [
        `({ process }) => ({ clientId: process.env[name] })`,
        `({ process }) => configure(process.env)`,
        `({ process }) => ({ ...process.env })`,
        `({ process }) => ({ clientId: Object.keys(process.env) })`,
        `({ process }) => ({ clientId: name in process.env })`,
        `({ process }) => { process = replacement; return {}; }`,
        `({ process }) => { process.env.CLIENT = "x"; return {}; }`,
        `({ process }) => ({ clientId: delete process.env.CLIENT })`,
        `({ process: { env: { ...rest } } }) => rest`,
        `getCallback()`,
        `async ({ process }) => ({ clientId: process.env.CLIENT })`
    ]) {
        await t.test(`rejects unanalyzable callback: ${expression}`, async () => {
            const { load } = await fixture({ "oidc.ts": `${setup}\nbootstrapOidc(${expression});` });
            await assert.rejects(
                load,
                /oidc-spa: Cannot determine public bootstrap environment variables in .*oidc\.ts:\d+:\d+/
            );
        });
    }
    await t.test("supports direct configuration objects without exposing any env", async () => {
        const { load } = await fixture({
            "oidc.ts": `${setup} bootstrapOidc({ implementation: "real", clientId: "client", issuerUri: "https://issuer" });`
        });
        assert.deepEqual(await load(), { publicEnvNames: [], toRedactEnvNames: [] });
    });
    await t.test("accepts TypeScript angle-bracket assertions in .ts sources", async () => {
        const { load } = await fixture({
            "oidc.ts": `${setup} const n = <number>1; bootstrapOidc(({ process }) => ({ clientId: process.env.CLIENT }));`
        });
        assert.deepEqual(await load(), { publicEnvNames: ["CLIENT"], toRedactEnvNames: [] });
    });
    await t.test(
        "development invalidation revokes removed names and fails closed on invalid edits",
        async () => {
            const { root, handler, load } = await fixture({
                "oidc.ts": `${setup} bootstrapOidc(({ process }) => ({ clientId: process.env.OLD }));`
            });
            const watcher = new EventEmitter();
            const httpServer = new EventEmitter();
            const invalidated: unknown[] = [];
            const messages: unknown[] = [];
            const module = {};
            handler.configureServer({
                watcher,
                httpServer,
                environments: {
                    ssr: {
                        moduleGraph: {
                            getModuleById: () => module,
                            invalidateModule: (value: unknown) => invalidated.push(value)
                        },
                        hot: { send: (value: unknown) => messages.push(value) }
                    }
                }
            } as any);
            assert.deepEqual(await load(), { publicEnvNames: ["OLD"], toRedactEnvNames: [] });
            const file = path.join(root, "oidc.ts");
            await writeFile(
                file,
                `${setup} bootstrapOidc(({ process }) => ({ clientId: process.env.NEW }));`
            );
            watcher.emit("change", file);
            assert.deepEqual(invalidated, [module]);
            assert.deepEqual(messages, [{ type: "full-reload" }]);
            assert.deepEqual(await load(), { publicEnvNames: ["NEW"], toRedactEnvNames: [] });
            await writeFile(
                file,
                `${setup} bootstrapOidc(({ process }) => ({ clientId: process.env[name] }));`
            );
            watcher.emit("change", file);
            await assert.rejects(load, /computed environment variable names/);
            await rm(file);
            watcher.emit("unlink", file);
            assert.deepEqual(await load(), { publicEnvNames: [], toRedactEnvNames: [] });
            httpServer.emit("close");
            assert.equal(watcher.listenerCount("change"), 0);
        }
    );
    await t.test("fresh plugin instances snapshot changed source and ignore build output", async () => {
        const { root, createHandler, load, read } = await fixture({
            "oidc.ts": `${setup} bootstrapOidc(({ process }) => ({ clientId: process.env.OLD }));`,
            "dist/old.ts": `${setup} bootstrapOidc(({ process }) => ({ clientId: process.env.STALE_BUILD }));`
        });
        assert.deepEqual(await load(), { publicEnvNames: ["OLD"], toRedactEnvNames: [] });
        await writeFile(
            path.join(root, "oidc.ts"),
            `${setup} bootstrapOidc(({ process }) => ({ clientId: process.env.NEW }));`
        );
        assert.deepEqual(await read(createHandler()), { publicEnvNames: ["NEW"], toRedactEnvNames: [] });
    });
});
