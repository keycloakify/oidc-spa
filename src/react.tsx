import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { createOidc, type Oidc } from "./oidc";
import { assert } from "tsafe/assert";

const oidcContext = createContext<Oidc | undefined>(undefined);

/** @see: https://github.com/garronej/oidc-spa#option-2-usage-directly-within-react */
export function createOidcProvider(params: Parameters<typeof createOidc>[0]) {
    const prOidc = createOidc(params);

    function OidcProvider(props: { fallback?: ReactNode; children: ReactNode }) {
        const { children, fallback } = props;

        const [oidc, setOidc] = useState<Oidc | undefined>(undefined);

        useEffect(() => {
            prOidc.then(setOidc);
        }, []);

        if (oidc === undefined) {
            return <>{fallback === undefined ? null : fallback}</>;
        }

        return <oidcContext.Provider value={oidc}>{children}</oidcContext.Provider>;
    }

    return { OidcProvider, prOidc };
}

/** @see: https://github.com/garronej/oidc-spa#option-2-usage-directly-within-react */
export function useOidc() {
    const oidc = useContext(oidcContext);
    assert(oidc !== undefined, "You must use useOidc inside a OidcProvider");
    return { oidc };
}
