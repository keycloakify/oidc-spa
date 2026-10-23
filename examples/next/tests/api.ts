import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

export function testApi(provider: "mock" | "Keycloak" | "Keycloak2") {
    const mock = provider === "mock";
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "test", alg: "RS256", use: "sig" };
    const tokens = new Map<string, Record<string, unknown>>();
    let issuer: string;
    let introspectionCalls = 0;
    const idp = createServer(async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/introspect") {
            introspectionCalls++;
            assert.equal(
                req.headers.authorization,
                `Basic ${Buffer.from("api-client:test-secret").toString("base64")}`
            );
            let body = "";
            for await (const chunk of req) body += chunk;
            const claims = tokens.get(new URLSearchParams(body).get("token") ?? "");
            const active =
                claims !== undefined &&
                claims.iss === issuer &&
                claims.aud === "account" &&
                typeof claims.sub === "string" &&
                Number(claims.exp) > Date.now() / 1000;
            res.end(JSON.stringify(active ? { ...claims, active: true } : { active: false }));
            return;
        }
        res.end(
            JSON.stringify(
                req.url === "/jwks"
                    ? { keys: [jwk] }
                    : {
                          jwks_uri: `${issuer}/jwks`,
                          introspection_endpoint: `${issuer}/introspect`
                      }
            )
        );
    });
    before(async () => {
        await new Promise<void>(resolve => idp.listen(0, "127.0.0.1", resolve));
        const address = idp.address();
        assert(address && typeof address !== "string");
        issuer = `http://127.0.0.1:${address.port}`;
        process.env.NEXT_PUBLIC_OIDC_PROVIDER = provider;
        process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER_URI = issuer;
        process.env.KEYCLOAK_EXPECTED_ACCESS_TOKEN_AUDIENCE = "account";
        process.env.NEXT_PUBLIC_KEYCLOAK2_ISSUER_URI = issuer;
        process.env.NEXT_PUBLIC_KEYCLOAK2_CLIENT_ID = "browser-client";
        process.env.KEYCLOAK2_API_CLIENT_ID = "api-client";
        process.env.KEYCLOAK2_API_CLIENT_SECRET = "test-secret";
    });
    after(
        () =>
            new Promise<void>((resolve, reject) => {
                idp.closeAllConnections();
                idp.close(error => (error ? reject(error) : resolve()));
            })
    );

    function token(sub = "alice", claims: Record<string, unknown> = {}) {
        const now = Math.floor(Date.now() / 1000);
        const payload = { iss: issuer, aud: "account", sub, iat: now, exp: now + 300, ...claims };
        const unsigned = [{ alg: "RS256", kid: "test" }, payload]
            .map(value => Buffer.from(JSON.stringify(value)).toString("base64url"))
            .join(".");
        const signed = `${unsigned}.${sign("sha256", Buffer.from(unsigned), keys.privateKey).toString(
            "base64url"
        )}`;
        tokens.set(signed, payload);
        return signed;
    }

    test(`${provider}: tRPC authenticates, isolates users, and restricts admin operations`, async t => {
        const directory = await mkdtemp(join(tmpdir(), "next-todos-api-"));
        const previousDirectory = process.cwd();
        process.chdir(directory);
        t.after(async () => {
            process.chdir(previousDirectory);
            await rm(directory, { recursive: true, force: true });
        });
        for (const key of ["KV_REST_API_URL", "KV_REST_API_TOKEN"]) {
            const previous = process.env[key];
            delete process.env[key];
            t.after(() => {
                if (previous !== undefined) process.env[key] = previous;
            });
        }
        const { appRouter: router } = await import("../lib/server/trpc");
        let cacheControl: string | null = null;
        const client = (authorization?: string, dpopProof?: (req: Request) => string) =>
            createTRPCClient<typeof router>({
                links: [
                    httpBatchLink({
                        url: "http://localhost/api/trpc",
                        headers: authorization ? { Authorization: authorization } : {},
                        fetch: async (url, init) => {
                            const req = new Request(url, init);
                            if (dpopProof) req.headers.set("DPoP", dpopProof(req));
                            const response = await fetchRequestHandler({
                                endpoint: "/api/trpc",
                                router,
                                req,
                                createContext: () => ({ req }),
                                responseMeta: () => ({
                                    headers: { "Cache-Control": "private, no-store" }
                                })
                            });
                            cacheControl = response.headers.get("cache-control");
                            return response;
                        }
                    })
                ]
            });
        const rejects = (promise: Promise<unknown>, code: string) =>
            assert.rejects(
                promise,
                error => error instanceof TRPCClientError && error.data?.code === code
            );
        await rejects(client().todos.list.query(), "UNAUTHORIZED");
        await rejects(client().todos.add.mutate("task"), "UNAUTHORIZED");
        await rejects(client().todos.listAllUserTodos.query(), "UNAUTHORIZED");
        await rejects(client().todos.delete.mutate({ userId: "alice", todoId: 1 }), "UNAUTHORIZED");
        await rejects(client("Basic credentials").todos.list.query(), "BAD_REQUEST");

        const alice = client(`Bearer ${mock ? "mock-token" : token()}`);
        const bob = client(`Bearer ${mock ? "another-token" : token("bob")}`);
        const defaults = [
            { id: 1, name: "Get groceries" },
            { id: 2, name: "Buy a new phone" }
        ];
        assert.deepEqual(await alice.todos.list.query(), defaults);
        await alice.todos.add.mutate("  Buy groceries  ");
        const saved = await alice.todos.list.query();
        assert.equal(saved.length, 3);
        assert.equal(saved[2].name, "Buy groceries");
        assert.equal(typeof saved[2].id, "number");
        assert.equal(cacheControl, "private, no-store");
        const userId = mock ? "mock-user-id" : "alice";
        assert.deepEqual(
            JSON.parse(
                await readFile(join(directory, `todos_${encodeURIComponent(userId)}.json`), "utf8")
            ),
            saved
        );
        assert.deepEqual(await bob.todos.list.query(), mock ? saved : defaults);
        const admin = client(`Bearer ${mock ? "mock-token" : token("admin", { roles: ["admin"] })}`);
        if (!mock) {
            await rejects(alice.todos.listAllUserTodos.query(), "FORBIDDEN");
            await rejects(alice.todos.delete.mutate({ userId: "bob", todoId: 1 }), "FORBIDDEN");
            await rejects(
                alice.todos.delete.mutate({ userId: "alice", todoId: saved[2].id }),
                "FORBIDDEN"
            );
            // The previous Keycloak-specific role no longer grants app admin access.
            await rejects(
                client(
                    `Bearer ${token("legacy-role", {
                        resource_access: { "realm-management": { roles: ["realm-admin"] } }
                    })}`
                ).todos.listAllUserTodos.query(),
                "FORBIDDEN"
            );
        }
        assert.deepEqual(
            await admin.todos.listAllUserTodos.query(),
            mock
                ? [{ userId, todos: saved }]
                : [
                      { userId: "alice", todos: saved },
                      { userId: "bob", todos: defaults }
                  ]
        );
        await rejects(alice.todos.add.mutate(" "), "BAD_REQUEST");
        await rejects(
            alice.todos.add.mutate({ name: "task", userId: "bob" } as unknown as string),
            "BAD_REQUEST"
        );
        await rejects(admin.todos.delete.mutate({ userId: "missing", todoId: 1 }), "NOT_FOUND");
        if (!mock) {
            await admin.todos.delete.mutate({ userId: "bob", todoId: 1 });
            assert.deepEqual(await bob.todos.list.query(), [defaults[1]]);
            assert.deepEqual(await alice.todos.list.query(), saved);
        }
        for (const todo of saved) await admin.todos.delete.mutate({ userId, todoId: todo.id });
        assert.deepEqual(await alice.todos.list.query(), []);
        assert.deepEqual(
            (await admin.todos.listAllUserTodos.query()).find(user => user.userId === userId)?.todos,
            []
        );
        if (!mock) {
            const proofKeys = generateKeyPairSync("ec", { namedCurve: "P-256" });
            const proofJwk = proofKeys.publicKey.export({ format: "jwk" });
            const thumbprint = createHash("sha256")
                .update(
                    JSON.stringify({
                        crv: proofJwk.crv,
                        kty: proofJwk.kty,
                        x: proofJwk.x,
                        y: proofJwk.y
                    })
                )
                .digest("base64url");
            const accessToken = token("alice", { cnf: { jkt: thumbprint } });
            let lastProof = "";
            let requestCount = 0;
            const dpopAlice = client(`DPoP ${accessToken}`, req => {
                requestCount++;
                const url = new URL(req.url);
                url.search = "";
                const unsigned = [
                    { alg: "ES256", typ: "dpop+jwt", jwk: proofJwk },
                    {
                        htm: req.method,
                        htu: url.href,
                        ath: createHash("sha256").update(accessToken).digest("base64url"),
                        iat: Math.floor(Date.now() / 1000),
                        jti: randomUUID()
                    }
                ]
                    .map(value => Buffer.from(JSON.stringify(value)).toString("base64url"))
                    .join(".");
                lastProof = `${unsigned}.${sign("sha256", Buffer.from(unsigned), {
                    key: proofKeys.privateKey,
                    dsaEncoding: "ieee-p1363"
                }).toString("base64url")}`;
                return lastProof;
            });

            // Strict Mode's two mount effects are batched into one HTTP request and one proof.
            const batch = await Promise.all([
                dpopAlice.todos.list.query(),
                dpopAlice.todos.list.query()
            ]);
            assert.equal(requestCount, 1);
            assert.deepEqual(batch, [[], []]);

            // Reusing that proof in another HTTP request must still be rejected.
            const replay = client(`DPoP ${accessToken}`, () => lastProof);
            await Promise.all([
                rejects(replay.todos.list.query(), "UNAUTHORIZED"),
                rejects(replay.todos.list.query(), "UNAUTHORIZED")
            ]);

            // Sharing authentication never grants admin permission to a batched procedure.
            const [list, adminList] = await Promise.allSettled([
                dpopAlice.todos.list.query(),
                dpopAlice.todos.listAllUserTodos.query()
            ]);
            assert.equal(list.status, "fulfilled");
            assert.equal(adminList.status, "rejected");
            assert(adminList.reason instanceof TRPCClientError);
            assert.equal(adminList.reason.data?.code, "FORBIDDEN");

            const forged = token().split(".");
            forged[2] = Buffer.alloc(256).toString("base64url");
            for (const invalid of [
                "invalid",
                forged.join("."),
                token("alice", { sub: undefined }),
                token("alice", { exp: 1 }),
                token("alice", { aud: "wrong" }),
                token("alice", { iss: "https://wrong.example" }),
                token("alice", { cnf: { jkt: "proof-required" } })
            ]) {
                await rejects(client(`Bearer ${invalid}`).todos.list.query(), "UNAUTHORIZED");
                await rejects(
                    client(`Bearer ${invalid}`).todos.listAllUserTodos.query(),
                    "UNAUTHORIZED"
                );
            }
        }
        if (provider === "Keycloak2") assert(introspectionCalls > 0);
    });
}
