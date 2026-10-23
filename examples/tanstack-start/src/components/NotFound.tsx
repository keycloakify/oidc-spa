import { Link } from "@tanstack/react-router";

export function NotFound() {
    return (
        <div>
            <h1>Page not found</h1>
            <p>The page you are looking for does not exist.</p>
            <p>
                <Link to="/">Home</Link>
            </p>
        </div>
    );
}
