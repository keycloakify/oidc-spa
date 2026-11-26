import { getUser } from "../../oidc";
import { getTodosStore } from "../../data/todos";

export default defineEventHandler(async event => {
    setHeader(event, "Cache-Control", "private, no-store");
    const user = await getUser(event.node.req);
    if (!user.isAdmin) {
        throw createError({ statusCode: 403, statusMessage: "Forbidden" });
    }
    return getTodosStore().readAllTodos();
});
