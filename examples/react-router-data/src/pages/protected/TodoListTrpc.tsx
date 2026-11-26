import { useEffect, useRef } from "react";
import {
    Form,
    useActionData,
    useLoaderData,
    useNavigation,
    type ActionFunctionArgs
} from "react-router";
import { trpc } from "~/trpc";

export function loader() {
    return trpc.todos.list.query();
}

export async function action({ request }: ActionFunctionArgs) {
    const formData = await request.formData();
    await trpc.todos.add.mutate(String(formData.get("todo") ?? ""));
    return { success: true };
}

export function Component() {
    const todos = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
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
