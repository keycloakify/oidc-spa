import { Form, isRouteErrorResponse, useNavigation } from "react-router";
import type { Route } from "./+types/todo-list-admin";
import { enforceLogin, getOidc } from "~/oidc";
import { trpc } from "~/trpc";

export async function clientLoader(args: Route.ClientLoaderArgs) {
    await enforceLogin(args);
    const oidc = await getOidc({ assert: "user logged in" });
    const user = await oidc.getUser();
    if (!user.canSeeAdminNavigation) {
        throw new Response("You need the admin role to view this page.", { status: 403 });
    }

    return { usersTodos: await trpc.todos.listAllUserTodos.query() };
}

export async function clientAction(args: Route.ClientActionArgs) {
    await enforceLogin(args);
    const formData = await args.request.formData();
    // Authorization is enforced independently in the tRPC procedure.
    await trpc.todos.delete.mutate({
        userId: String(formData.get("userId")),
        todoId: Number(formData.get("todoId"))
    });
    return null;
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
