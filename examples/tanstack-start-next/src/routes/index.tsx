import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
    component: Home
});

function Home() {
    return (
        <>
            <h1>Home</h1>
            <p>Welcome to the TanStack Start example.</p>
            <ul>
                <li>
                    <Link to="/todo-list-server-function">Todo List (Server Function)</Link>
                </li>
                <li>
                    <Link to="/todo-list-api">Todo List (API)</Link>
                </li>
            </ul>
        </>
    );
}
