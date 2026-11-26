import { useEffect, useState, type SubmitEvent } from "react";
import { fetchWithAuth } from "~/oidc";
import type { TodoItem } from "../../../server/data/todos";

async function getTodos(): Promise<TodoItem[]> {
    const response = await fetchWithAuth("/api/todos");

    return response.json();
}

export default function TodoListApiPage() {
    const [todos, setTodos] = useState<TodoItem[]>();
    const [newTodo, setNewTodo] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        let active = true;
        getTodos().then(todos => {
            if (active) setTodos(todos);
        });
        return () => {
            active = false;
        };
    }, []);

    async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (isSubmitting || newTodo.trim() === "") return;
        setIsSubmitting(true);
        await fetchWithAuth("/api/todos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newTodo })
        });

        setNewTodo("");
        setTodos(await getTodos());
        setIsSubmitting(false);
    }

    return (
        <>
            <h1>Todo List (API)</h1>
            <p>Your personal todo list, backed by Express handlers.</p>
            {todos === undefined ? (
                <p>Loading todos...</p>
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
        </>
    );
}
