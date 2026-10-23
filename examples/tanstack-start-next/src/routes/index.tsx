import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
    component: Home
});

function Home() {
    return (
        <>
            <h1>Welcome to My App</h1>
            <p>A minimal TanStack Start example with oidc-spa. Choose a todo list to get started.</p>
            <div className="example-links">
                <Link to="/todo-list-server-function">
                    <strong>Server function</strong>
                    <span>A personal todo list using a protected server function.</span>
                </Link>
                <Link to="/todo-list-api">
                    <strong>API route</strong>
                    <span>The same todo list using authenticated API requests.</span>
                </Link>
            </div>
        </>
    );
}
