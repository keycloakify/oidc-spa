import { createFileRoute } from "@tanstack/react-router";
import { oidcRequestMiddleware } from "src/oidc";
import * as dataTodos from "src/data/todos";

export const Route = createFileRoute("/demo/api/todos")({
    server: {
        middleware: [oidcRequestMiddleware({ assert: "user logged in" })],
        handlers: {
            GET: async ({ context: { oidc } }) => {
                const userId = oidc.accessTokenClaims.sub;

                const todos = await dataTodos.readTodos({ userId });

                return new Response(JSON.stringify(todos), {
                    headers: {
                        "Content-Type": "application/json"
                    }
                });
            }
        }
    }
});
