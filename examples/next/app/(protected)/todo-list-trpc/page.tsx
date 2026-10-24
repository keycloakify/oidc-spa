"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { trpc } from "@/lib/trpc";
import type { TodoItem } from "@/lib/server/data/todos";

export default function TodoListTrpcPage() {
    const [todos, setTodos] = useState<TodoItem[]>();
    const [newTodo, setNewTodo] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string>();
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let active = true;
        trpc.todos.list.query().then(
            todos => {
                if (active) {
                    setTodos(todos);
                    setError(undefined);
                }
            },
            error => {
                if (active) setError(error instanceof Error ? error.message : "Could not load todos.");
            }
        );
        return () => {
            active = false;
        };
    }, [reload]);

    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (isSubmitting || newTodo.trim() === "") return;
        setIsSubmitting(true);
        setError(undefined);
        try {
            await trpc.todos.add.mutate(newTodo);
            setNewTodo("");
            setTodos(await trpc.todos.list.query());
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
            {todos === undefined ? (
                <>
                    {!error && <p>Loading todos...</p>}
                    {error && (
                        <button type="button" onClick={() => setReload(value => value + 1)}>
                            Try again
                        </button>
                    )}
                </>
            ) : (
                <>
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
            )}
            {error && <p role="alert">{error}</p>}
        </>
    );
}
