import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createNodeFsTodoStore } from "../lib/server/todos";

export function testApi(mock: boolean) {
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "test", alg: "RS256", use: "sig" };
    let issuer: string;
    const idp = createServer((req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(req.url === "/jwks" ? { keys: [jwk] } : { jwks_uri: `${issuer}/jwks` }));
    });
    before(async () => {
        await new Promise<void>(resolve => idp.listen(0, "127.0.0.1", resolve));
        const address = idp.address();
        assert(address && typeof address !== "string");
        issuer = `http://127.0.0.1:${address.port}`;
        process.env.NEXT_PUBLIC_OIDC_USE_MOCK = String(mock);
        process.env.NEXT_PUBLIC_OIDC_ISSUER_URI = issuer;
        process.env.NEXT_PUBLIC_OIDC_ACCESS_TOKEN_EXPECTED_AUDIENCE = "account";
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
        const unsigned = [
            { alg: "RS256", kid: "test" },
            {
                iss: issuer,
                aud: "account",
                sub,
                iat: now,
                exp: now + 300,
                ...claims
            }
        ]
            .map(value => Buffer.from(JSON.stringify(value)).toString("base64url"))
            .join(".");
        return `${unsigned}.${sign("sha256", Buffer.from(unsigned), keys.privateKey).toString(
            "base64url"
        )}`;
    }

    test(
        mock ? "mock API uses a static identity" : "real API validates tokens and isolates users",
        async t => {
            const directory = await mkdtemp(join(tmpdir(), "next-todos-api-"));
            t.after(() => rm(directory, { recursive: true, force: true }));
            t.mock.method(process, "cwd", () => directory);
            for (const key of ["KV_REST_API_URL", "KV_REST_API_TOKEN"]) {
                const previous = process.env[key];
                delete process.env[key];
                t.after(() => {
                    if (previous !== undefined) {
                        process.env[key] = previous;
                    }
                });
            }
            const { appRouter: router } = await import("../lib/server/trpc");
            let cacheControl: string | null = null;
            const client = (authorization?: string) =>
                createTRPCClient<typeof router>({
                    links: [
                        httpBatchLink({
                            url: "http://localhost/api/trpc",
                            headers: authorization ? { Authorization: authorization } : {},
                            fetch: async (url, init) => {
                                const req = new Request(url, init);
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
            await rejects(client().todos.listAllUserTodos.query(), "UNAUTHORIZED");
            await rejects(client().todos.save.mutate([]), "UNAUTHORIZED");
            await rejects(client("Basic credentials").todos.list.query(), "BAD_REQUEST");

            const alice = client(`Bearer ${mock ? "mock-token" : token()}`);
            const bob = client(`Bearer ${mock ? "another-token" : token("bob")}`);
            assert.deepEqual(await alice.todos.list.query(), []);
            const item = { id: randomUUID(), name: "  Buy groceries  ", completed: false };
            const saved = await alice.todos.save.mutate([item]);
            assert.equal(saved[0].name, "Buy groceries");
            assert.deepEqual(await alice.todos.list.query(), saved);
            assert.equal(cacheControl, "private, no-store");
            assert.deepEqual(
                await createNodeFsTodoStore(join(directory, ".todos")).readTodos(
                    mock ? "mock-user-id" : "alice"
                ),
                saved
            );
            assert.deepEqual(await bob.todos.list.query(), mock ? saved : []);
            const admin = client(
                `Bearer ${
                    mock
                        ? "mock-token"
                        : token("admin", {
                              resource_access: { "realm-management": { roles: ["realm-admin"] } }
                          })
                }`
            );
            if (!mock) {
                await rejects(alice.todos.listAllUserTodos.query(), "UNAUTHORIZED");
                await rejects(
                    client(
                        `Bearer ${token("realm-role-only", {
                            realm_access: { roles: ["realm-admin"] }
                        })}`
                    ).todos.listAllUserTodos.query(),
                    "UNAUTHORIZED"
                );
                await rejects(
                    client(
                        `Bearer ${token("other-client-admin", {
                            resource_access: { "another-client": { roles: ["realm-admin"] } }
                        })}`
                    ).todos.listAllUserTodos.query(),
                    "UNAUTHORIZED"
                );
                await rejects(
                    client(
                        `Bearer ${token("view-only", {
                            resource_access: { "realm-management": { roles: ["view-users"] } }
                        })}`
                    ).todos.listAllUserTodos.query(),
                    "UNAUTHORIZED"
                );
                await bob.todos.save.mutate([{ ...saved[0], completed: true }]);
            }
            assert.deepEqual(
                await admin.todos.listAllUserTodos.query(),
                mock
                    ? [{ userId: "mock-user-id", todos: saved }]
                    : [
                          { userId: "alice", todos: saved },
                          { userId: "bob", todos: [{ ...saved[0], completed: true }] }
                      ]
            );
            await rejects(alice.todos.save.mutate([{ ...item, name: " " }]), "BAD_REQUEST");
            await rejects(alice.todos.save.mutate([item, item]), "BAD_REQUEST");
            await rejects(
                alice.todos.save.mutate([{ ...item, userId: "bob" } as typeof item]),
                "BAD_REQUEST"
            );
            const completed = await alice.todos.save.mutate([{ ...saved[0], completed: true }]);
            assert.equal(completed[0].completed, true);
            await alice.todos.save.mutate([]);
            assert.deepEqual(await alice.todos.list.query(), []);

            if (!mock) {
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
        }
    );
}
