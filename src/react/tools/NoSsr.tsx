import { useState, useEffect } from "react";

/**
 * There is nothing specific to OIDC with this component.
 * This is provided purely for convenance, feel free to use your own
 * tooling.
 *
 * This is a trivial implementation of a No Server Side Rendering
 * boundary.
 * The children will only be rendered in the client side.
 * You can optionally provide a fallback that will be rendered by the server.
 */
export function NoSsr(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
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
