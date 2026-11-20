import { Redis } from "@upstash/redis";
import type { TodoItem, TodosStore } from "./port";

const DEFAULT_TODOS: ReadonlyArray<TodoItem> = [
    { id: 1, name: "Get groceries" },
    { id: 2, name: "Buy a new phone" }
];

const cloneDefaultTodos = (): TodoItem[] => DEFAULT_TODOS.map(todo => ({ ...todo }));
const buildStorageKey = (userId: string) => `todos:${userId}`;

export function createKvStoreTodoStore(params: { restUrl: string; restToken: string }): TodosStore {
    const { restUrl, restToken } = params;
    const redis = new Redis({
        url: restUrl,
        token: restToken
    });

    const todosStore: TodosStore = {
        readTodos: async ({ userId }) => {
            const stored = await redis.get<TodoItem[]>(buildStorageKey(userId));

            if (stored !== null) return stored;

            const todos = cloneDefaultTodos();
            await redis.set(buildStorageKey(userId), todos, { nx: true });

            return todos;
        },
        readAllTodos: async () => {
            const userIds = new Set<string>();
            let cursor = "0";

            do {
                const [nextCursor, keys] = await redis.scan(cursor, { match: "todos:*", count: 100 });
                cursor = nextCursor;

                for (const key of keys) {
                    userIds.add(key.slice("todos:".length));
                }
            } while (cursor !== "0");

            return Promise.all(
                [...userIds].sort().map(async userId => ({
                    userId,
                    todos: await todosStore.readTodos({ userId })
                }))
            );
        },
        updateTodos: async ({ userId, todos }) => {
            await redis.set(buildStorageKey(userId), todos);
        }
    };

    return todosStore;
}
