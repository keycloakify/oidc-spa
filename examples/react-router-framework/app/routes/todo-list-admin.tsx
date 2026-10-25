import { Form, isRouteErrorResponse, useNavigation } from "react-router";
import type { Route } from "./+types/todo-list-admin";
import { enforceLogin } from "~/oidc";
import { z } from "zod";
import { getUser } from "~/oidc.server";
import { getTodosStore } from "~/.server/data/todos";

export function headers() {
    return { "Cache-Control": "no-store" };
}

export async function loader({ request }: Route.LoaderArgs) {
    const user = await getUser(request);
    if (!user.isAdmin) {
        throw new Response("You need the admin role to view this page.", { status: 403 });
    }
    return { usersTodos: await getTodosStore().readAllTodos() };
}

export async function action({ request }: Route.ActionArgs) {
    const user = await getUser(request);
    if (!user.isAdmin) {
        throw new Response("You need the admin role to delete todos.", { status: 403 });
    }

    const formData = await request.formData();
    const input = z
        .object({
            userId: z.string().min(1),
            todoId: z.coerce.number().int()
        })
        .safeParse(Object.fromEntries(formData));
    if (!input.success) {
        throw new Response("Invalid todo.", { status: 400 });
    }

    const store = getTodosStore();
    const userTodos = (await store.readAllTodos()).find(({ userId }) => userId === input.data.userId);
    if (userTodos === undefined) {
        throw new Response("User not found.", { status: 404 });
    }
    await store.updateTodos({
        userId: input.data.userId,
        todos: userTodos.todos.filter(todo => todo.id !== input.data.todoId)
    });
    return null;
}

export async function clientLoader(args: Route.ClientLoaderArgs) {
    await enforceLogin(args);
    return args.serverLoader();
}

export async function clientAction(args: Route.ClientActionArgs) {
    await enforceLogin(args);
    return args.serverAction();
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    if (!isRouteErrorResponse(error) || error.status !== 403) throw error;

    return (
        <>
            <h1>Access denied</h1>
            <p>You need the admin role to view this page.</p>
        </>
    );
}

export default function TodoListAdminPage({ loaderData: { usersTodos } }: Route.ComponentProps) {
    const isDeleting = useNavigation().state !== "idle";

    return (
        <>
            <h1>Todo List Admin</h1>
            <p>Todos from every user, grouped by user ID.</p>
            {usersTodos.length === 0 && <p className="empty-state">No user todos yet.</p>}
            {usersTodos.map(({ userId, todos }) => (
                <section key={userId} className="todo-group">
                    <h2>
                        User: <code>{userId}</code>
                    </h2>
                    {todos.length === 0 ? (
                        <p className="empty-state">No todos.</p>
                    ) : (
                        <ul className="todo-list">
                            {todos.map(todo => (
                                <li key={todo.id}>
                                    <span>{todo.name}</span>
                                    <Form method="post">
                                        <input type="hidden" name="userId" value={userId} />
                                        <input type="hidden" name="todoId" value={todo.id} />
                                        <button
                                            type="submit"
                                            className="button-danger"
                                            disabled={isDeleting}
                                            aria-label={`Delete ${todo.name} for ${userId}`}
                                        >
                                            Delete
                                        </button>
                                    </Form>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            ))}
        </>
    );
}
