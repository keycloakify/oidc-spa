import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/todo-list-admin")({
    component: TodoListAdmin
});

function TodoListAdmin() {
    return (
        <>
            <h1>Todo List Admin</h1>
            <p>Todo list administration will be added here.</p>
        </>
    );
}
