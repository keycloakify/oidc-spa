import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { trpc } from "~/trpc";
import { TRPCClientError } from "@trpc/client";

export const Route = createFileRoute("/_authenticated/todo-list-admin")({
    loader: () => trpc.todos.listAllUserTodos.query(),
    component: TodoListAdmin,
    pendingComponent: () => <p>Loading todos...</p>,
    errorComponent: ({ error }) => {
        if (!(error instanceof TRPCClientError) || error.data?.code !== "FORBIDDEN") {
            throw error;
        }
        return <AccessDenied />;
    }
});

function AccessDenied() {
    return (
        <>
            <h1>Access denied</h1>
            <p>You need the admin role to view this page.</p>
        </>
    );
}

function TodoListAdmin() {
    const router = useRouter();
    const usersTodos = Route.useLoaderData();
    const [isDeleting, setIsDeleting] = useState(false);

    async function handleDelete(userId: string, todoId: number) {
        if (isDeleting) {
            return;
        }

        setIsDeleting(true);
        await trpc.todos.delete.mutate({ userId, todoId });
        await router.invalidate();
        setIsDeleting(false);
    }

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
                                    <button
                                        type="button"
                                        className="button-danger"
                                        disabled={isDeleting}
                                        aria-label={`Delete ${todo.name} for ${userId}`}
                                        onClick={() => handleDelete(userId, todo.id)}
                                    >
                                        Delete
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            ))}
        </>
    );
}
