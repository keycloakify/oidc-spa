import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
    component: Home
});

function Home() {
    return (
        <>
            <h1>Home</h1>
            <p>Welcome to the TanStack Start example.</p>
        </>
    );
}
