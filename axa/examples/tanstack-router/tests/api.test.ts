import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createHash, generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import type { AppRouter } from "../server/trpc";

const signingKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = {
    ...signingKey.publicKey.export({ format: "jwk" }),
    kid: "test-key",
    alg: "RS256",
    use: "sig"
};
let issuer: string;
let apiUrl: string;
let identityServer: Server;
let apiServer: Server;
let testDirectory: string;
const originalCwd = process.cwd();
const originalEnvironment = { ...process.env };

async function listen(server: Server) {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return `http://127.0.0.1:${address.port}`;
}
function encode(value: unknown) {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function jwt(
    payload: object,
    key: KeyObject = signingKey.privateKey,
    header: object = { alg: "RS256", kid: "test-key" }
) {
    const input = `${encode(header)}.${encode(payload)}`;
    const signature = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
    return `${input}.${signature.toString("base64url")}`;
}
function token(claims: object = {}, key = signingKey.privateKey) {
    return jwt(
        {
            iss: issuer,
            sub: "test-user",
            aud: "myapp-api",
            exp: Math.floor(Date.now() / 1000) + 3600,
            ...claims
        },
        key
    );
}
function trpc(accessToken?: string) {
    return createTRPCClient<AppRouter>({
        links: [
            httpBatchLink({
                url: `${apiUrl}/api/trpc`,
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
            })
        ]
    });
}

before(async () => {
    identityServer = createServer((req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/.well-known/openid-configuration") {
            res.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/jwks` }));
        } else if (req.url === "/jwks") {
            res.end(JSON.stringify({ keys: [publicJwk] }));
        } else {
            res.writeHead(404).end();
        }
    });
    issuer = await listen(identityServer);
    process.env.VITE_KEYCLOAK_ISSUER_URI = issuer;
    process.env.KEYCLOAK_EXPECTED_ACCESS_TOKEN_AUDIENCE = "myapp-api";
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    testDirectory = await mkdtemp(join(tmpdir(), "axa-todos-test-"));
    process.chdir(testDirectory);
    const { app } = await import("../server/app");
    apiServer = createServer(app);
    apiUrl = await listen(apiServer);
});

after(async () => {
    process.chdir(originalCwd);
    for (const name of Object.keys(process.env))
        if (!(name in originalEnvironment)) delete process.env[name];
    Object.assign(process.env, originalEnvironment);
    await Promise.all(
        [apiServer, identityServer]
            .filter(Boolean)
            .map(
                server =>
                    new Promise<void>((resolve, reject) =>
                        server.close(error => (error ? reject(error) : resolve()))
                    )
            )
    );
    if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
});

test("REST and tRPC reject unauthenticated requests", async () => {
    assert.equal((await fetch(`${apiUrl}/api/todos`)).status, 401);
    await assert.rejects(
        trpc().todos.list.query(),
        error => error instanceof TRPCClientError && error.data.code === "UNAUTHORIZED"
    );
});

test("REST and tRPC share authenticated per-user data", async () => {
    const accessToken = token();
    const response = await fetch(`${apiUrl}/api/todos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Prepare the presentation" })
    });
    assert.equal(response.status, 201);
    const todos = await trpc(accessToken).todos.list.query();
    assert.ok(todos.some(todo => todo.name === "Prepare the presentation"));
    const otherUserTodos = await trpc(token({ sub: "another-user" })).todos.list.query();
    assert.ok(otherUserTodos.every(todo => todo.name !== "Prepare the presentation"));
});

for (const [name, claims] of [
    ["wrong audience", { aud: "another-api" }],
    ["expired token", { exp: Math.floor(Date.now() / 1000) - 300 }],
    ["wrong issuer", { iss: "https://another-issuer.example" }]
] as const) {
    test(`rejects ${name}`, async () => {
        const response = await fetch(`${apiUrl}/api/todos`, {
            headers: { Authorization: `Bearer ${token(claims)}` }
        });
        assert.equal(response.status, 401);
    });
}

test("rejects a token signed by another key", async () => {
    const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const response = await fetch(`${apiUrl}/api/todos`, {
        headers: { Authorization: `Bearer ${token({}, otherKey.privateKey)}` }
    });
    assert.equal(response.status, 401);
});

test("admin procedures enforce the role on the server", async () => {
    await assert.rejects(
        trpc(token()).todos.listAllUserTodos.query(),
        error => error instanceof TRPCClientError && error.data.code === "FORBIDDEN"
    );
    const admin = trpc(token({ roles: ["admin"] }));
    const allTodos = await admin.todos.listAllUserTodos.query();
    const user = allTodos.find(user => user.userId === "test-user")!;
    const todo = user.todos.find(todo => todo.name === "Prepare the presentation")!;
    assert.ok(todo);
    await assert.rejects(
        trpc(token()).todos.delete.mutate({ userId: user.userId, todoId: todo.id }),
        error => error instanceof TRPCClientError && error.data.code === "FORBIDDEN"
    );
    await admin.todos.delete.mutate({ userId: user.userId, todoId: todo.id });
    assert.ok((await trpc(token()).todos.list.query()).every(item => item.id !== todo.id));
});

test("accepts DPoP and rejects proof replay or missing proof", async () => {
    const key = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const jwk = key.publicKey.export({ format: "jwk" });
    const thumbprint = createHash("sha256")
        .update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }))
        .digest("base64url");
    const accessToken = token({ cnf: { jkt: thumbprint } });
    const proof = jwt(
        {
            jti: randomUUID(),
            htm: "GET",
            htu: `${apiUrl}/api/todos`,
            iat: Math.floor(Date.now() / 1000),
            ath: createHash("sha256").update(accessToken).digest("base64url")
        },
        key.privateKey,
        { alg: "ES256", typ: "dpop+jwt", jwk }
    );
    const headers = { Authorization: `DPoP ${accessToken}`, DPoP: proof };
    assert.equal((await fetch(`${apiUrl}/api/todos`, { headers })).status, 200);
    assert.equal((await fetch(`${apiUrl}/api/todos`, { headers })).status, 401);
    assert.equal(
        (await fetch(`${apiUrl}/api/todos`, { headers: { Authorization: `Bearer ${accessToken}` } }))
            .status,
        401
    );
});
