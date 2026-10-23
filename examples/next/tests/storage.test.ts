import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeFsTodoStore } from "../lib/server/data/todos/todos_nodeFs";

test("file storage isolates subjects, persists defaults and empty lists, and surfaces corrupt data", async t => {
    const directory = await mkdtemp(join(tmpdir(), "next-todos-storage-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const store = createNodeFsTodoStore({ dirPath: directory });
    const todos = [{ id: 3, name: "Test" }];
    const userId = "../../outside/user";
    assert.deepEqual(await store.readAllTodos(), []);
    await store.updateTodos({ userId, todos });
    const files = await readdir(directory);
    assert.deepEqual(files, [`todos_${encodeURIComponent(userId)}.json`]);
    assert.deepEqual(JSON.parse(await readFile(join(directory, files[0]), "utf8")), todos);
    assert.deepEqual(await store.readAllTodos(), [{ userId, todos }]);
    await writeFile(join(directory, "todos_incomplete.json.tmp"), "partial write");
    assert.equal((await store.readAllTodos()).length, 1);
    assert.equal((await store.readTodos({ userId: "another-user" })).length, 2);
    assert.equal((await store.readAllTodos()).length, 2);
    await store.updateTodos({ userId, todos: [] });
    assert.deepEqual(await store.readTodos({ userId }), []);
    await writeFile(join(directory, files[0]), "broken json");
    await assert.rejects(store.readTodos({ userId }));
});
