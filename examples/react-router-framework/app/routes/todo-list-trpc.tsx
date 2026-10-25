import { useEffect, useRef } from "react";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/todo-list-trpc";
import { enforceLogin } from "~/oidc";
import { trpc } from "~/trpc";

export async function clientLoader(args: Route.ClientLoaderArgs) {
    await enforceLogin(args);
    return { todos: await trpc.todos.list.query() };
}

export async function clientAction(args: Route.ClientActionArgs) {
    await enforceLogin(args);
    const formData = await args.request.formData();
    await trpc.todos.add.mutate(String(formData.get("todo")));
    return { success: true };
}

export default function TodoListTrpcPage({ loaderData: { todos }, actionData }: Route.ComponentProps) {
    const formRef = useRef<HTMLFormElement>(null);
    const isSubmitting = useNavigation().state !== "idle";

    useEffect(() => {
        if (actionData?.success) formRef.current?.reset();
    }, [actionData]);

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
