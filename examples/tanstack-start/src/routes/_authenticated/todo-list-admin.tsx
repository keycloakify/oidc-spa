import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { oidcFnMiddleware } from "~/oidc";
import { getTodosStore } from "~/data/todos";

const getAllTodos = createServerFn({ method: "GET" })
    .middleware([
        oidcFnMiddleware({
            require: "authed request",
            hasAuthorization: ({ user }) => user.isAdmin
        })
    ])
    .handler(async () => getTodosStore().readAllTodos());

const deleteTodo = createServerFn({ method: "POST" })
    .validator(z.object({ userId: z.string().min(1), todoId: z.number().int() }))
    .middleware([
        oidcFnMiddleware({
            require: "authed request",
            hasAuthorization: ({ user }) => user.isAdmin
        })
    ])
    .handler(async ({ data }) => {
        const todosStore = getTodosStore();
        const userTodos = (await todosStore.readAllTodos()).find(({ userId }) => userId === data.userId);

        if (userTodos === undefined) {
            throw new Error("User not found.");
        }

        await todosStore.updateTodos({
            userId: data.userId,
            todos: userTodos.todos.filter(todo => todo.id !== data.todoId)
        });
    });

export const Route = createFileRoute("/_authenticated/todo-list-admin")({
    loader: () => getAllTodos(),
    component: TodoListAdmin,
    pendingComponent: () => <p>Loading todos...</p>,
    errorComponent: ({ error }) => {
        if (!(error instanceof Error) || !error.message.includes('error="insufficient_scope"')) {
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
        await deleteTodo({ data: { userId, todoId } });
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
