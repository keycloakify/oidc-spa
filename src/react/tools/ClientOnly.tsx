import { useState, useEffect } from "react";

/**
 * Generic client-only rendering boundary (unrelated to OIDC).
 *
 * Children are rendered only after hydration on the client.
 * During SSR, the optional `fallback` is shown instead.
 *
 * Provided here for convenience—you can replace it with your own
 * implementation or existing tooling if you prefer.
 */
export function ClientOnly(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    const { children, fallback } = props;

    const [isHydrated, setIsHydrated] = useState(false);
    useEffect(() => {
        setIsHydrated(true);
    }, []);

    if (!isHydrated) {
        return <>{fallback ?? null}</>;
    }

    return <>{children}</>;
}
