import type { TodosStore } from "./port";

export function createKvStoreTodoStore(params: { kvUrl: string; kvToken: string }): TodosStore {
    const { kvUrl, kvToken } = params;

    console.log("TODO", kvUrl, kvToken);

    return {
        readTodos: async ({ userId }) => {
            console.log("TODO", userId);
            return null as any;
        },
        updateTodos: async ({ userId, todos }) => {
            console.log("TODO", userId, todos);
        }
    };
}
