"use client";

import Link from "next/link";

export default function ErrorPage({
    error,
    retry
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    return (
        <>
            <h1>Something went wrong</h1>
            <p>{error.message || "An unexpected error occurred."}</p>
            <button type="button" onClick={() => retry()}>
                Try again
            </button>{" "}
            <Link href="/">Home</Link>
        </>
    );
}
