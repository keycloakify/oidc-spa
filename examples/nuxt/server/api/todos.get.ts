import { getUser } from "../oidc";
import { getTodosStore } from "../data/todos";

export default defineEventHandler(async event => {
    setHeader(event, "Cache-Control", "private, no-store");
    const user = await getUser(event.node.req);
    return getTodosStore().readTodos({ userId: user.id });
});
