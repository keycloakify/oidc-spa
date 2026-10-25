import { useEffect, useRef } from "react";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/todo-list-api";
import { enforceLogin, getOidc } from "~/oidc";
import type { TodoItem } from "../../server/data/todos";

export async function clientLoader(args: Route.ClientLoaderArgs) {
    await enforceLogin(args);
    const oidc = await getOidc({ assert: "user logged in" });
    const response = await fetch("/api/todos", {
        headers: { Authorization: `Bearer ${await oidc.getAccessToken()}` }
    });
    if (!response.ok) throw new Error("Could not load todos.");

    const todos: TodoItem[] = await response.json();
    return { todos };
}

export async function clientAction(args: Route.ClientActionArgs) {
    await enforceLogin(args);
    const oidc = await getOidc({ assert: "user logged in" });
    const formData = await args.request.formData();
    const response = await fetch("/api/todos", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${await oidc.getAccessToken()}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: formData.get("todo") })
    });
    if (!response.ok) throw new Error("Could not add todo.");

    return { success: true };
}

export default function TodoListApiPage({ loaderData: { todos }, actionData }: Route.ComponentProps) {
    const formRef = useRef<HTMLFormElement>(null);
    const isSubmitting = useNavigation().state !== "idle";

    useEffect(() => {
        if (actionData?.success) formRef.current?.reset();
    }, [actionData]);

    return (
        <>
            <h1>Todo List (API)</h1>
            <p>Your personal todo list, backed by Express route handlers.</p>
            {todos.length === 0 ? (
                <p className="empty-state">No todos yet.</p>
            ) : (
                <ul className="todo-list">
                    {todos.map(todo => (
                        <li key={todo.id}>{todo.name}</li>
                    ))}
                </ul>
            )}
            <Form method="post" className="todo-form" ref={formRef}>
                <label htmlFor="new-todo">New todo</label>
                <input
                    id="new-todo"
                    name="todo"
                    placeholder="What needs to be done?"
                    disabled={isSubmitting}
                    required
                />
                <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Adding..." : "Add todo"}
                </button>
            </Form>
        </>
    );
}
