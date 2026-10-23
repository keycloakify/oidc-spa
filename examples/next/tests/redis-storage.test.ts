import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createServer } from "node:http";
import { createKvStoreTodoStore } from "../lib/server/data/todos/todos_kvStore";

test("Upstash REST storage persists and isolates user lists", async t => {
    const values = new Map<string, string>();
    values.set("unrelated:key", "not a todo list");
    let scanCalls = 0;
    const server = createServer(async (req, res) => {
        assert.equal(req.headers.authorization, "Bearer test-redis-token");
        let body = "";
        for await (const chunk of req) {
            body += chunk;
        }
        const run = ([command, key, value, pattern]: string[]) => {
            if (command.toUpperCase() === "SCAN") {
                scanCalls++;
                assert.equal(value.toUpperCase(), "MATCH");
                assert.equal(pattern, "todos:*");
                const keys = [...values.keys()].filter(key => key.startsWith("todos:"));
                // Exercise multiple pages and Redis SCAN's possible duplicate keys.
                const cursor = Number(key);
                return {
                    result: [
                        cursor + 1 < keys.length ? String(cursor + 1) : "0",
                        keys.length ? [keys[cursor], keys[cursor]] : []
                    ]
                };
            }
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
    const store = createKvStoreTodoStore({
        restUrl: `http://127.0.0.1:${address.port}`,
        restToken: "test-redis-token"
    });
    assert.equal((await store.readTodos({ userId: "alice" })).length, 2);
    const todos = [{ id: 3, name: "Redis task" }];
    await store.updateTodos({ userId: "alice", todos: todos });
    assert.deepEqual(await store.readTodos({ userId: "alice" }), todos);
    assert.deepEqual(JSON.parse(values.get("todos:alice")!), todos);
    assert.equal((await store.readTodos({ userId: "bob" })).length, 2);
    await store.updateTodos({ userId: "bob", todos: [] });
    await store.updateTodos({ userId: "user:with/slashes", todos: todos });
    assert.deepEqual(await store.readAllTodos(), [
        { userId: "alice", todos },
        { userId: "bob", todos: [] },
        { userId: "user:with/slashes", todos }
    ]);
    assert.equal(scanCalls, 3);
    await store.updateTodos({ userId: "alice", todos: [] });
    assert.deepEqual(await store.readTodos({ userId: "alice" }), []);
});
