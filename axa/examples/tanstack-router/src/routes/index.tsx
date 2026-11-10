import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
    return (
        <article className="home-guide">
            <h1>AXA OIDC + TanStack Router</h1>
            <p>
                A minimal todo app with Keycloak authentication. TanStack Router and Vite run the SPA;
                Express hosts a REST API and tRPC. Both APIs authenticate access tokens and use the same
                todo store.
            </p>
            <div className="example-links">
                <Link to="/todo-list-trpc">
                    <strong>Todo List · tRPC</strong>
                    <span>Load and add your personal todos with a typed API client.</span>
                </Link>
                <Link to="/todo-list-api">
                    <strong>Todo List · API</strong>
                    <span>The same todos, using fetch and ordinary Express handlers.</span>
                </Link>
            </div>
            <p>
                The <Link to="/todo-list-admin">admin page</Link> groups todos by user and lets admins
                delete items. Open your <Link to="/account">account page</Link> from the avatar to view
                your profile and available Keycloak account actions.
            </p>
        </article>
    );
}
