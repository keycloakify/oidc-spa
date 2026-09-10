import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
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
export type TodosStore = {
    readTodos: (userId: string) => Promise<TodoItem[]>;
    updateTodos: (userId: string, todos: TodoItem[]) => Promise<void>;
};

export function createNodeFsTodoStore(dirPath: string): TodosStore {
    // OIDC subjects can contain slashes; never use a claim directly as a file path.
    const filePath = (userId: string) =>
        join(dirPath, `todos_${createHash("sha256").update(userId).digest("hex")}.json`);

    return {
        async readTodos(userId) {
            try {
                return todosSchema.parse(JSON.parse(await readFile(filePath(userId), "utf8")));
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
                await writeFile(temporary, JSON.stringify(todos, null, 2), { mode: 0o600 });
                await rename(temporary, destination);
            } finally {
                await rm(temporary, { force: true });
            }
        }
    };
}

export function createRedisTodoStore(config: { url: string; token: string }): TodosStore {
    const redis = new Redis(config);
    const key = (userId: string) => `oidc-spa:next:todos:${userId}`;

    return {
        async readTodos(userId) {
            const todos = await redis.get(key(userId));
            return todos === null ? [] : todosSchema.parse(todos);
        },
        async updateTodos(userId, todos) {
            await redis.set(key(userId), todos);
        }
    };
}

let store: TodosStore | undefined;

export function getTodosStore(): TodosStore {
    if (store) {
        return store;
    }

    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (Boolean(url) !== Boolean(token)) {
        throw new Error("Set both KV_REST_API_URL and KV_REST_API_TOKEN to use Upstash Redis.");
    }

    store =
        url && token
            ? createRedisTodoStore({ url, token })
            : createNodeFsTodoStore(join(process.cwd(), ".todos"));
    return store;
}
