import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeFsTodoStore, createRedisTodoStore } from "../lib/server/todos";

test("file storage contains subjects safely and does not hide corrupt data", async t => {
    const directory = await mkdtemp(join(tmpdir(), "next-todos-storage-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const store = createNodeFsTodoStore(directory);
    const todos = [{ id: randomUUID(), name: "Test", completed: false }];
    await store.updateTodos("../../outside/user", todos);
    const files = await readdir(directory);
    assert.equal(files.length, 1);
    assert.match(files[0], /^todos_[a-f0-9]{64}\.json$/);
    assert.deepEqual(JSON.parse(await readFile(join(directory, files[0]), "utf8")), todos);
    assert.deepEqual(await store.readTodos("../../outside/user"), todos);
    assert.deepEqual(await store.readTodos("another-user"), []);
    await writeFile(join(directory, files[0]), "broken json");
    await assert.rejects(store.readTodos("../../outside/user"));
});

test("Upstash REST storage persists and isolates user lists", async t => {
    const values = new Map<string, string>();
    const server = createServer(async (req, res) => {
        assert.equal(req.headers.authorization, "Bearer test-redis-token");
        let body = "";
        for await (const chunk of req) {
            body += chunk;
        }
        const run = ([command, key, value]: string[]) => {
            if (command.toUpperCase() === "SET") {
                values.set(key, value);
                return { result: "OK" };
            }
            assert.equal(command.toUpperCase(), "GET");
            return { result: values.get(key) ?? null };
        };
        const commands = JSON.parse(body);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(req.url === "/pipeline" ? commands.map(run) : run(commands)));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(
        () =>
            new Promise<void>((resolve, reject) => {
                server.closeAllConnections();
                server.close(error => (error ? reject(error) : resolve()));
            })
    );
    const address = server.address();
    assert(address && typeof address !== "string");
    const config = { url: `http://127.0.0.1:${address.port}`, token: "test-redis-token" };
    const store = createRedisTodoStore(config);
    assert.deepEqual(await store.readTodos("alice"), []);
    const todos = [{ id: randomUUID(), name: "Redis task", completed: false }];
    await store.updateTodos("alice", todos);
    assert.deepEqual(await createRedisTodoStore(config).readTodos("alice"), todos);
    assert.deepEqual(await store.readTodos("bob"), []);
    await store.updateTodos("alice", []);
    assert.deepEqual(await store.readTodos("alice"), []);
});
