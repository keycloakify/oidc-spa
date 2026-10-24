import { useState, type SubmitEvent } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { enforceLogin, getOidc } from "~/oidc";
import type { TodoItem } from "~/data/todos";

export const Route = createFileRoute("/todo-list-api")({
    beforeLoad: enforceLogin,
    loader: async () => {
        const oidc = await getOidc({ assert: "user logged in" });
        const response = await fetch("/api/todos", {
            headers: { Authorization: `Bearer ${await oidc.getAccessToken()}` }
        });

        if (!response.ok) {
            throw new Error("Could not load todos.");
        }

        const todos: TodoItem[] = await response.json();
        return todos;
    },
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

        const oidc = await getOidc({ assert: "user logged in" });

        try {
            const response = await fetch("/api/todos", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${await oidc.getAccessToken()}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: newTodo })
            });

            if (!response.ok) {
                throw new Error("Could not add todo.");
            }

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
            <h1>Todo List (API)</h1>
            <p>Your personal todo list, backed by an API route.</p>
            {todos.length === 0 ? (
                <p className="empty-state">No todos yet.</p>
            ) : (
                <ul className="todo-list">
                    {todos.map(todo => (
                        <li key={todo.id}>{todo.name}</li>
                    ))}
                </ul>
            )}
            <form onSubmit={handleSubmit} className="todo-form">
                <label htmlFor="new-todo">New todo</label>
                <input
                    id="new-todo"
                    name="todo"
                    placeholder="What needs to be done?"
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
