import { useEffect, useRef } from "react";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/todo-list";
import { enforceLogin } from "~/oidc";
import { getUser } from "~/.server/oidc";
import { getTodosStore } from "~/.server/data/todos";

export function headers() {
    return { "Cache-Control": "no-store" };
}

export async function loader({ request }: Route.LoaderArgs) {
    const user = await getUser(request);
    const todos = await getTodosStore().readTodos({ userId: user.id });
    return { todos };
}

export async function action({ request }: Route.ActionArgs) {
    const user = await getUser(request);
    const formData = await request.formData();
    const name = formData.get("todo");

    if (typeof name !== "string" || name.trim() === "") {
        throw new Response("A todo name is required.", { status: 400 });
    }

    const store = getTodosStore();
    const todos = await store.readTodos({ userId: user.id });
    await store.updateTodos({
        userId: user.id,
        todos: [...todos, { id: Date.now(), name: name.trim() }]
    });
    return { success: true };
}

export async function clientLoader(args: Route.ClientLoaderArgs) {
    await enforceLogin(args);
    return args.serverLoader();
}

export async function clientAction(args: Route.ClientActionArgs) {
    await enforceLogin(args);
    return args.serverAction();
}

export default function TodoListPage({ loaderData: { todos }, actionData }: Route.ComponentProps) {
    const formRef = useRef<HTMLFormElement>(null);
    const isSubmitting = useNavigation().state !== "idle";

    useEffect(() => {
        if (actionData?.success) formRef.current?.reset();
    }, [actionData]);

    return (
        <>
            <h1>Todo List</h1>
            <p>Your personal todo list, using React Router loaders and actions.</p>
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
