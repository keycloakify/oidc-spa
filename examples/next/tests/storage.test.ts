import { strict as assert } from "node:assert";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("file storage contains subjects safely and does not hide corrupt data", async t => {
    const root = await mkdtemp(join(tmpdir(), "next-todos-storage-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    t.mock.method(process, "cwd", () => root);
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    const { todosStore: store } = await import("../lib/server/todos");
    const directory = join(root, ".todos");
    const todos = [{ id: randomUUID(), name: "Test", completed: false }];
    assert.deepEqual(await store.listAllUserTodos(), []);
    await store.updateTodos("../../outside/user", todos);
    const files = await readdir(directory);
    assert.equal(files.length, 1);
    assert.match(files[0], /^todos_[a-f0-9]{64}\.json$/);
    assert.deepEqual(JSON.parse(await readFile(join(directory, files[0]), "utf8")), {
        userId: "../../outside/user",
        todos
    });
    assert.deepEqual(await store.listAllUserTodos(), [{ userId: "../../outside/user", todos }]);
    await writeFile(join(directory, "todos_incomplete.json.tmp"), "partial write");
    assert.equal((await store.listAllUserTodos()).length, 1);
    // Older arrays remain readable and gain the user ID when their owner loads them.
    await writeFile(join(directory, files[0]), JSON.stringify(todos));
    assert.deepEqual(await store.listAllUserTodos(), []);
    assert.deepEqual(await store.readTodos("../../outside/user"), todos);
    assert.deepEqual(await store.listAllUserTodos(), [{ userId: "../../outside/user", todos }]);
    assert.deepEqual(await store.readTodos("another-user"), []);
    await writeFile(join(directory, files[0]), "broken json");
    await assert.rejects(store.readTodos("../../outside/user"));
});
