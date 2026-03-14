import { createNodeFsTodoStore } from "./todos_nodeFs";
import { createKvStoreTodoStore } from "./todos_kvStore";
import type { TodosStore, TodoItem } from "./port";
export type { TodoItem };

let todosStore: TodosStore | undefined = undefined;

type RedisConfig = {
    restUrl: string;
    restToken: string;
};

const resolveRedisConfig = (): RedisConfig | undefined => {
    const restUrl = process.env["KV_REST_API_URL"];
    const restToken = process.env["KV_REST_API_TOKEN"];

    if (!restUrl || !restToken) {
        return undefined;
    }

    return { restUrl, restToken };
};

export function getTodosStore() {
    if (!todosStore) {
        const redisConfig = resolveRedisConfig();

        todosStore = redisConfig
            ? createKvStoreTodoStore(redisConfig)
            : createNodeFsTodoStore({
                  dirPath: "."
              });
    }

    return todosStore;
}
