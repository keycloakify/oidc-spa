import { useState, type SubmitEvent } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { fetchWithAuth } from "~/oidc";
import type { TodoItem } from "../../../server/data/todos";

export const Route = createFileRoute("/_authenticated/todo-list-api")({
    loader: async () => {
        const response = await fetchWithAuth("/api/todos");

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

    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();

        if (isSubmitting || newTodo.trim() === "") {
            return;
        }

        setIsSubmitting(true);

        await fetchWithAuth("/api/todos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newTodo })
        });

        setNewTodo("");
        await router.invalidate();
        setIsSubmitting(false);
    }

    return (
        <>
            <h1>Todo List (API)</h1>
            <p>Your personal todo list, backed by Express handlers.</p>
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
        </>
    );
}
