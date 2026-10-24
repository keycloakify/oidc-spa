import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { oidcRequestMiddleware } from "~/oidc";
import { getTodosStore, type TodoItem } from "~/data/todos";

export const Route = createFileRoute("/api/todos")({
    server: {
        middleware: [oidcRequestMiddleware({ require: "authed request" })],
        handlers: {
            GET: async ({ context: { oidc } }) => {
                const todos = await getTodosStore().readTodos({ userId: oidc.user.id });

                return Response.json(todos, { headers: { "Cache-Control": "no-store" } });
            },
            POST: async ({ request, context: { oidc } }) => {
                const result = z
                    .object({ name: z.string().trim().min(1) })
                    .safeParse(await request.json().catch(() => undefined));

                if (!result.success) {
                    return Response.json(
                        { error: "A non-empty todo name is required." },
                        { status: 400 }
                    );
                }

                const todosStore = getTodosStore();
                const userId = oidc.user.id;
                const todos = await todosStore.readTodos({ userId });
                const todo: TodoItem = { id: Date.now(), name: result.data.name };

                await todosStore.updateTodos({ userId, todos: [...todos, todo] });

                return Response.json(todo, { status: 201 });
            }
        }
    }
});
