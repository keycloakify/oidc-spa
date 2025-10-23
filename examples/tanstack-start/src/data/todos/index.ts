import { createNodeFsTodoStore } from "./todos_nodeFs";
import { createKvStoreTodoStore } from "./todos_kvStore";
import type { TodosStore, TodoItem } from "./port";
export type { TodoItem };

let todosStore: TodosStore | undefined = undefined;

export function getTodosStore() {
    if (todosStore !== undefined) {
        return todosStore;
    }

    const kvUrl = process.env["KV_URL"];
    const kvToken = process.env["KV_TOKEN"];

    return kvUrl !== undefined && kvToken !== undefined
        ? createKvStoreTodoStore({
              kvUrl,
              kvToken
          })
        : createNodeFsTodoStore({
              dirPath: "."
          });
}
