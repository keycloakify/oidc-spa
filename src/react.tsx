import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { createOidc, type Oidc } from "./oidc";
import { assert } from "tsafe/assert";

const oidcClientContext = createContext<Oidc | undefined>(undefined);

export function createOidcClientProvider(params: Parameters<typeof createOidc>[0]) {
    const prOidc = createOidc(params);

    function OidcClientProvider(props: { fallback?: ReactNode; children: ReactNode }) {
        const { children, fallback } = props;

        const [oidcClient, setOidcClient] = useState<Oidc | undefined>(undefined);

        useEffect(() => {
            prOidc.then(setOidcClient);
        }, []);

        if (oidcClient === undefined) {
            return <>{fallback === undefined ? null : fallback}</>;
        }

        return <oidcClientContext.Provider value={oidcClient}>{children}</oidcClientContext.Provider>;
    }

    return { OidcClientProvider };
}

export function useOidc() {
    const oidc = useContext(oidcClientContext);
    assert(oidc !== undefined, "You must use useOidc inside a OidcClientProvider");
    return { oidc };
}
