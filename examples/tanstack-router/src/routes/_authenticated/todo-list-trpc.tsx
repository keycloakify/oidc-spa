import { useState, type SubmitEvent } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { trpc } from "~/trpc";

export const Route = createFileRoute("/_authenticated/todo-list-trpc")({
    loader: () => trpc.todos.list.query(),
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
        await trpc.todos.add.mutate(newTodo);
        setNewTodo("");
        await router.invalidate();
        setIsSubmitting(false);
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
