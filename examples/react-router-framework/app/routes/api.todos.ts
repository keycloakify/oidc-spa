import type { Route } from "./+types/api.todos";
import { z } from "zod";
import { getUser } from "~/.server/oidc";
import { getTodosStore, type TodoItem } from "~/.server/data/todos";

export async function loader({ request }: Route.LoaderArgs) {
    const user = await getUser(request);
    const todos = await getTodosStore().readTodos({ userId: user.id });
    return Response.json(todos, { headers: { "Cache-Control": "no-store" } });
}

export async function action({ request }: Route.ActionArgs) {
    const user = await getUser(request);
    if (request.method !== "POST") {
        return Response.json(
            { error: "Method not allowed." },
            { status: 405, headers: { Allow: "GET, HEAD, POST" } }
        );
    }
    const input = z
        .object({ name: z.string().trim().min(1) })
        .safeParse(await request.json().catch(() => undefined));
    if (!input.success)
        return Response.json({ error: "A non-empty todo name is required." }, { status: 400 });
    const store = getTodosStore();
    const todos = await store.readTodos({ userId: user.id });
    const todo: TodoItem = { id: Date.now(), name: input.data.name };
    await store.updateTodos({ userId: user.id, todos: [...todos, todo] });
    return Response.json(todo, { status: 201, headers: { "Cache-Control": "no-store" } });
}
