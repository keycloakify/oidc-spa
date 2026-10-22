import { Link, useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
    const router = useRouter();
    return (
        <div>
            <h1>Something went wrong</h1>
            <p>{error instanceof Error ? error.message : "An unexpected error occurred."}</p>
            <button type="button" onClick={() => router.invalidate()}>
                Try again
            </button>{" "}
            <Link to="/">Home</Link>
        </div>
    );
}
