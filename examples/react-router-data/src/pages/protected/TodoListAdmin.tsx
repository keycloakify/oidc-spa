import {
    Form,
    useLoaderData,
    useNavigation,
    useRouteError,
    type ActionFunctionArgs
} from "react-router";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "~/trpc";

export function loader() {
    return trpc.todos.listAllUserTodos.query();
}

export async function action({ request }: ActionFunctionArgs) {
    const formData = await request.formData();
    await trpc.todos.delete.mutate({
        userId: String(formData.get("userId") ?? ""),
        todoId: Number(formData.get("todoId"))
    });
    return null;
}

export function ErrorBoundary() {
    const error = useRouteError();
    if (!(error instanceof TRPCClientError) || error.data?.code !== "FORBIDDEN") throw error;
    return <AccessDenied />;
}

function AccessDenied() {
    return (
        <>
            <h1>Access denied</h1>
            <p>You need the admin role to view this page.</p>
        </>
    );
}

export function Component() {
    const usersTodos = useLoaderData<typeof loader>();
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
