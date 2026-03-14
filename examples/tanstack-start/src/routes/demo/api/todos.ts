import { createFileRoute } from "@tanstack/react-router";
import { oidcRequestMiddleware } from "@/oidc";
import { getTodosStore } from "@/data/todos";

export const Route = createFileRoute("/demo/api/todos")({
    server: {
        middleware: [oidcRequestMiddleware({ assert: "user logged in" })],
        handlers: {
            GET: async ({ context: { oidc } }) => {
                const userId = oidc.accessTokenClaims.sub;

                const todosStore = getTodosStore();

                const todos = await todosStore.readTodos({ userId });

                return new Response(JSON.stringify(todos), {
                    headers: {
                        "Content-Type": "application/json"
                    }
                });
            }
        }
    }
});
