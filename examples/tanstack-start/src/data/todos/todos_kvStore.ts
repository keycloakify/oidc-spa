import { Redis } from "@upstash/redis";
import type { TodoItem, TodosStore } from "./port";

const DEFAULT_TODOS: ReadonlyArray<TodoItem> = [
    { id: 1, name: "Get groceries" },
    { id: 2, name: "Buy a new phone" }
];

const cloneDefaultTodos = (): TodoItem[] => DEFAULT_TODOS.map(todo => ({ ...todo }));
const buildStorageKey = (userId: string) => `todos:${userId}`;

const isTodoItem = (value: unknown): value is TodoItem =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "number" &&
    typeof (value as { name?: unknown }).name === "string";

const safeJsonParse = (value: string): unknown => {
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
};

const parseTodoList = (value: unknown): TodoItem[] | undefined => {
    const raw = typeof value === "string" ? safeJsonParse(value) : value;

    if (Array.isArray(raw) && raw.every(isTodoItem)) {
        return raw as TodoItem[];
    }

    return undefined;
};

export function createKvStoreTodoStore(params: { restUrl: string; restToken: string }): TodosStore {
    const { restUrl, restToken } = params;
    const redis = new Redis({
        url: restUrl,
        token: restToken
    });

    return {
        readTodos: async ({ userId }) => {
            try {
                const stored = await redis.get<TodoItem[] | string | null>(buildStorageKey(userId));
                const todos = stored === null ? undefined : parseTodoList(stored);

                return todos ?? cloneDefaultTodos();
            } catch (error) {
                console.warn("Falling back to default todos after Upstash read failure.", error);
                return cloneDefaultTodos();
            }
        },
        updateTodos: async ({ userId, todos }) => {
            await redis.set(buildStorageKey(userId), todos);
        }
    };
}
