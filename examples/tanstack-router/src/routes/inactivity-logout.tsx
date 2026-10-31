import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/inactivity-logout")({
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
            <a href={return_url}>Resume to where I was</a>
        </>
    );
}
