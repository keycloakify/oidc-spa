import { useEffect, useState } from "react";
import { useOidc } from "~/oidc";
import { trpc } from "~/trpc";

type UsersTodos = Awaited<ReturnType<typeof trpc.todos.listAllUserTodos.query>>;

export default function TodoListAdminPage() {
    const { user } = useOidc({ assert: "user logged in" });
    // This check is for the UI. The server procedures enforce authorization independently.
    return user.canSeeAdminNavigation ? <AllUserTodos /> : <AccessDenied />;
}

function AccessDenied() {
    return (
        <>
            <h1>Access denied</h1>
            <p>You need the admin role to view this page.</p>
        </>
    );
}

function AllUserTodos() {
    const [usersTodos, setUsersTodos] = useState<UsersTodos>();
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        let active = true;
        trpc.todos.listAllUserTodos.query().then(users => {
            if (active) setUsersTodos(users);
        });
        return () => {
            active = false;
        };
    }, []);

    async function handleDelete(userId: string, todoId: number) {
        if (isDeleting) return;
        setIsDeleting(true);
        await trpc.todos.delete.mutate({ userId, todoId });
        setUsersTodos(await trpc.todos.listAllUserTodos.query());
        setIsDeleting(false);
    }

    return (
        <>
            <h1>Todo List Admin</h1>
            <p>Todos from every user, grouped by user ID.</p>
            {usersTodos === undefined && <p>Loading todos...</p>}
            {usersTodos?.length === 0 && <p className="empty-state">No user todos yet.</p>}
            {usersTodos?.map(({ userId, todos }) => (
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
