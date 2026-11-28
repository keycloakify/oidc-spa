import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/_app/inactivity-logout")({
    validateSearch: z.object({
        return_url: z.url().catch("/")
    }),
    component: InactivityLogout
});

function InactivityLogout() {
    const { return_url } = Route.useSearch();

    return (
        <>
            <h1>You have been logged out due to inactivity</h1>
            <p>Sign in again to pick up where you left off.</p>
            {/* The return URL is only known for the real request, not during prerendering. */}
            <ClientOnly fallback={<Link to="/">Return home</Link>}>
                <a href={return_url}>Resume to where I was</a>
            </ClientOnly>
        </>
    );
}
