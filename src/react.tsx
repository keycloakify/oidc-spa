import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { createOidc, type Oidc } from "./oidc";
import { assert } from "tsafe/assert";

const oidcClientContext = createContext<Oidc | undefined>(undefined);

/** @see: https://github.com/garronej/oidc-spa#option-2-usage-directly-within-react */
export function createOidcProvider(params: Parameters<typeof createOidc>[0]) {
    const prOidc = createOidc(params);

    function OidcProvider(props: { fallback?: ReactNode; children: ReactNode }) {
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

    return { OidcProvider };
}

/** @see: https://github.com/garronej/oidc-spa#option-2-usage-directly-within-react */
export function useOidc() {
    const oidc = useContext(oidcClientContext);
    assert(oidc !== undefined, "You must use useOidc inside a OidcClientProvider");
    return { oidc };
}
