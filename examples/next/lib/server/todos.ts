import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Redis } from "@upstash/redis";
import { z } from "zod";

export const todosSchema = z
    .array(
        z
            .object({
                id: z.uuid(),
                name: z.string().trim().min(1).max(200),
                completed: z.boolean()
            })
            .strict()
    )
    .max(200)
    .refine(todos => new Set(todos.map(todo => todo.id)).size === todos.length, {
        message: "Todo IDs must be unique."
    });
export type TodoItem = z.infer<typeof todosSchema>[number];
const userTodosSchema = z.object({ userId: z.string().min(1), todos: todosSchema });
export type UserTodos = z.infer<typeof userTodosSchema>;
export type TodosStore = {
    readTodos: (userId: string) => Promise<TodoItem[]>;
    updateTodos: (userId: string, todos: TodoItem[]) => Promise<void>;
    listAllUserTodos: () => Promise<UserTodos[]>;
};

export function createNodeFsTodoStore(dirPath: string): TodosStore {
    // OIDC subjects can contain slashes; never use a claim directly as a file path.
    const filePath = (userId: string) =>
        join(dirPath, `todos_${createHash("sha256").update(userId).digest("hex")}.json`);

    const store: TodosStore = {
        async readTodos(userId) {
            try {
                const stored = JSON.parse(await readFile(filePath(userId), "utf8"));
                // Upgrade older files when the owner's identity is available.
                if (Array.isArray(stored)) {
                    const todos = todosSchema.parse(stored);
                    await store.updateTodos(userId, todos);
                    return todos;
                }
                return userTodosSchema.parse(stored).todos;
            } catch (error) {
                if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                    return [];
                }
                throw error;
            }
        },
        async updateTodos(userId, todos) {
            await mkdir(dirPath, { recursive: true });
            const destination = filePath(userId);
            const temporary = `${destination}.${randomUUID()}.tmp`;
            try {
                await writeFile(temporary, JSON.stringify({ userId, todos }, null, 2), { mode: 0o600 });
                await rename(temporary, destination);
            } finally {
                await rm(temporary, { force: true });
            }
        },
        async listAllUserTodos() {
            let files: string[];
            try {
                files = await readdir(dirPath);
            } catch (error) {
                if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                    return [];
                }
                throw error;
            }
            const users: UserTodos[] = [];
            for (const file of files.filter(file => /^todos_[a-f0-9]{64}\.json$/.test(file))) {
                const stored = JSON.parse(await readFile(join(dirPath, file), "utf8"));
                // Legacy arrays have no recoverable user ID until their owner loads them.
                if (Array.isArray(stored)) {
                    continue;
                }
                users.push(userTodosSchema.parse(stored));
            }
            return users.sort((a, b) => a.userId.localeCompare(b.userId));
        }
    };
    return store;
}

export function createRedisTodoStore(config: { url: string; token: string }): TodosStore {
    const redis = new Redis(config);
    const prefix = "oidc-spa:next:todos:";
    const key = (userId: string) => `${prefix}${userId}`;

    return {
        async readTodos(userId) {
            const todos = await redis.get(key(userId));
            return todos === null ? [] : todosSchema.parse(todos);
        },
        async updateTodos(userId, todos) {
            await redis.set(key(userId), todos);
        },
        async listAllUserTodos() {
            const keys = new Set<string>();
            let cursor = "0";
            do {
                const [nextCursor, page] = await redis.scan(cursor, { match: `${prefix}*`, count: 100 });
                cursor = nextCursor;
                page.forEach(key => keys.add(key));
            } while (cursor !== "0");

            const users: UserTodos[] = [];
            for (const key of keys) {
                const stored = await redis.get(key);
                if (stored !== null) {
                    users.push({ userId: key.slice(prefix.length), todos: todosSchema.parse(stored) });
                }
            }
            return users.sort((a, b) => a.userId.localeCompare(b.userId));
        }
    };
}
