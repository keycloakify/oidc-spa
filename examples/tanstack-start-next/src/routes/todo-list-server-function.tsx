import { useState, type SubmitEvent } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { enforceLogin, oidcFnMiddleware } from "~/oidc";
import { getTodosStore, type TodoItem } from "~/data/todos";

const getTodos = createServerFn({ method: "GET" })
    .middleware([oidcFnMiddleware({ require: "authed request" })])
    .handler(async ({ context: { oidc } }) => {
        return getTodosStore().readTodos({ userId: oidc.user.id });
    });

const addTodo = createServerFn({ method: "POST" })
    .validator(z.string().trim().min(1))
    .middleware([oidcFnMiddleware({ require: "authed request" })])
    .handler(async ({ data, context: { oidc } }) => {
        const todosStore = getTodosStore();
        const userId = oidc.user.id;
        const todos = await todosStore.readTodos({ userId });

        const todo: TodoItem = { id: Date.now(), name: data };

        await todosStore.updateTodos({ userId, todos: [...todos, todo] });
    });

export const Route = createFileRoute("/todo-list-server-function")({
    beforeLoad: enforceLogin,
    loader: () => getTodos(),
    component: TodoList,
    pendingComponent: () => <p>Loading todos...</p>
});

function TodoList() {
    const router = useRouter();
    const todos = Route.useLoaderData();
    const [newTodo, setNewTodo] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string>();

    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();

        if (isSubmitting || newTodo.trim() === "") {
            return;
        }

        setIsSubmitting(true);
        setError(undefined);

        try {
            await addTodo({ data: newTodo });
            setNewTodo("");
            await router.invalidate();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Could not add todo.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <>
            <h1>Todo List (Server Function)</h1>
            {todos.length === 0 ? (
                <p>No todos yet.</p>
            ) : (
                <ul>
                    {todos.map(todo => (
                        <li key={todo.id}>{todo.name}</li>
                    ))}
                </ul>
            )}
            <form
                onSubmit={handleSubmit}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
                <label htmlFor="new-todo">New todo</label>
                <input
                    id="new-todo"
                    name="todo"
                    value={newTodo}
                    onChange={event => setNewTodo(event.target.value)}
                    disabled={isSubmitting}
                    required
                />
                <button type="submit" disabled={isSubmitting || newTodo.trim() === ""}>
                    {isSubmitting ? "Adding..." : "Add todo"}
                </button>
            </form>
            {error && <p role="alert">{error}</p>}
        </>
    );
}
