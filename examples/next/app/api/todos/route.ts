import { z } from "zod";
import { AuthError, getUser } from "@/lib/server/oidc";
import { getTodosStore, type TodoItem } from "@/lib/server/data/todos";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
    try {
        const user = await getUser(req);
        const todos = await getTodosStore().readTodos({ userId: user.id });

        return Response.json(todos, { headers });
    } catch (error) {
        return handleError(error);
    }
}

export async function POST(req: Request) {
    try {
        const user = await getUser(req);
        const result = z
            .object({ name: z.string().trim().min(1) })
            .safeParse(await req.json().catch(() => undefined));

        if (!result.success) {
            return Response.json(
                { error: "A non-empty todo name is required." },
                { status: 400, headers }
            );
        }

        const todosStore = getTodosStore();
        const userId = user.id;
        const todos = await todosStore.readTodos({ userId });
        const todo: TodoItem = { id: Date.now(), name: result.data.name };

        await todosStore.updateTodos({ userId, todos: [...todos, todo] });

        return Response.json(todo, { status: 201, headers });
    } catch (error) {
        return handleError(error);
    }
}

function handleError(error: unknown) {
    if (error instanceof AuthError) {
        return Response.json({ error: error.message }, { status: error.status, headers });
    }

    console.error(error);
    return Response.json({ error: "Could not complete request." }, { status: 500, headers });
}
