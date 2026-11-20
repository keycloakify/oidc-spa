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
    const { kvRestApiUrl: restUrl, kvRestApiToken: restToken } = useRuntimeConfig();

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
                  dirPath: useRuntimeConfig().todosDir
              });
    }

    return todosStore;
}
