import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/todo-list")({
    component: TodoList
});

function TodoList() {
    return (
        <>
            <h1>Todo List</h1>
            <p>No todos yet.</p>
        </>
    );
}
