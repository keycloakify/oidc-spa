import { useState, type SubmitEvent } from "react";
import { useRevalidator } from "react-router";
import type { Route } from "./+types/todo-list-trpc";
import { trpc } from "~/trpc";

export function clientLoader() {
    return trpc.todos.list.query();
}

export default function TodoList({ loaderData: todos }: Route.ComponentProps) {
    const revalidator = useRevalidator();
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
            await trpc.todos.add.mutate(newTodo);
            setNewTodo("");
            await revalidator.revalidate();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Could not add todo.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <>
            <h1>Todo List (tRPC)</h1>
            <p>Your personal todo list, backed by tRPC.</p>
            {todos.length === 0 ? (
                <p className="empty-state">No todos yet.</p>
            ) : (
                <ul className="todo-list">
                    {todos.map(todo => (
                        <li key={todo.id}>{todo.name}</li>
                    ))}
                </ul>
            )}
            {error && <p role="alert">{error}</p>}
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
