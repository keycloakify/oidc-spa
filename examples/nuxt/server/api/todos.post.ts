import { z } from "zod";
import { getUser } from "../oidc";
import { getTodosStore, type TodoItem } from "../data/todos";

export default defineEventHandler(async event => {
    setHeader(event, "Cache-Control", "private, no-store");
    const user = await getUser(event.node.req);
    const { name } = await readValidatedBody(event, z.object({ name: z.string().trim().min(1) }).parse);
    const store = getTodosStore();
    const todos = await store.readTodos({ userId: user.id });
    const todo: TodoItem = { id: Date.now(), name };
    await store.updateTodos({ userId: user.id, todos: [...todos, todo] });
    setResponseStatus(event, 201);
    return todo;
});
