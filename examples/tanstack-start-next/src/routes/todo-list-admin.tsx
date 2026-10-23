import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { enforceLogin, getOidc, oidcFnMiddleware } from "~/oidc";
import { getTodosStore } from "~/data/todos";

const getAllTodos = createServerFn({ method: "GET" })
    .middleware([
        oidcFnMiddleware({
            require: "authed request",
            hasAuthorization: ({ user }) => user.isAdmin
        })
    ])
    .handler(async () => getTodosStore().readAllTodos());

const deleteTodo = createServerFn({ method: "POST" })
    .validator(z.object({ userId: z.string().min(1), todoId: z.number().int() }))
    .middleware([
        oidcFnMiddleware({
            require: "authed request",
            hasAuthorization: ({ user }) => user.isAdmin
        })
    ])
    .handler(async ({ data }) => {
        const todosStore = getTodosStore();
        const userTodos = (await todosStore.readAllTodos()).find(({ userId }) => userId === data.userId);

        if (userTodos === undefined) {
            throw new Error("User not found.");
        }

        await todosStore.updateTodos({
            userId: data.userId,
            todos: userTodos.todos.filter(todo => todo.id !== data.todoId)
        });
    });

export const Route = createFileRoute("/todo-list-admin")({
    beforeLoad: enforceLogin,
    loader: async () => {
        const oidc = await getOidc({ assert: "user logged in" });
        const user = await oidc.getUser();

        // This check is for the UI. The server functions enforce authorization independently.
        if (!user.canSeeAdminNavigation) {
            throw new Error("unauthorized");
        }

        return getAllTodos();
    },
    component: TodoListAdmin,
    pendingComponent: () => <p>Loading todos...</p>,
    errorComponent: ({ error }) => {
        if (
            !(error instanceof Error) ||
            (error.message !== "unauthorized" && !error.message.includes('error="insufficient_scope"'))
        ) {
            throw error;
        }

        return (
            <>
                <h1>Access denied</h1>
                <p>You need the admin role to view this page.</p>
            </>
        );
    }
});

function TodoListAdmin() {
    const router = useRouter();
    const usersTodos = Route.useLoaderData();
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string>();

    async function handleDelete(userId: string, todoId: number) {
        if (isDeleting) {
            return;
        }

        setIsDeleting(true);
        setError(undefined);

        try {
            await deleteTodo({ data: { userId, todoId } });
            await router.invalidate();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Could not delete todo.");
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <>
            <h1>Todo List Admin</h1>
            {usersTodos.length === 0 && <p>No user todos yet.</p>}
            {usersTodos.map(({ userId, todos }) => (
                <section key={userId}>
                    <h2>{userId}</h2>
                    {todos.length === 0 ? (
                        <p>No todos.</p>
                    ) : (
                        <ul>
                            {todos.map(todo => (
                                <li key={todo.id}>
                                    {todo.name}{" "}
                                    <button
                                        type="button"
                                        disabled={isDeleting}
                                        aria-label={`Delete ${todo.name} for ${userId}`}
                                        onClick={() => handleDelete(userId, todo.id)}
                                    >
                                        Delete
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            ))}
            {error && <p role="alert">{error}</p>}
        </>
    );
}
