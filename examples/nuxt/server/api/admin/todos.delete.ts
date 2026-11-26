import { z } from "zod";
import { getUser } from "../../oidc";
import { getTodosStore } from "../../data/todos";

export default defineEventHandler(async event => {
    setHeader(event, "Cache-Control", "private, no-store");
    const user = await getUser(event.node.req);
    if (!user.isAdmin) {
        throw createError({ statusCode: 403, statusMessage: "Forbidden" });
    }
    const { userId, todoId } = await readValidatedBody(
        event,
        z.object({ userId: z.string().min(1), todoId: z.number().int() }).parse
    );
    const store = getTodosStore();
    const userTodos = (await store.readAllTodos()).find(todos => todos.userId === userId);
    if (userTodos === undefined) {
        throw createError({ statusCode: 404, statusMessage: "User not found." });
    }
    await store.updateTodos({
        userId,
        todos: userTodos.todos.filter(todo => todo.id !== todoId)
    });
    setResponseStatus(event, 204);
});
