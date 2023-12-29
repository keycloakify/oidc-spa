import { useMemo } from "react";
import { createOidcProvider, useOidc } from "oidc-spa/react";
import { decodeJwt } from "oidc-spa";

export const { OidcProvider, prOidc } = createOidcProvider({
    clientId: import.meta.env.VITE_OIDC_CLIENT_ID,
    issuerUri: import.meta.env.VITE_OIDC_ISSUER
});

// Convenience hook to get the parsed idToken
// To call only when the user is logged in
export function useUser() {
    const { oidc } = useOidc();

    if (!oidc.isUserLoggedIn) {
        throw new Error("This hook should be used only on authenticated routes");
    }

    // NOTE: When idToken changes, the component get re-rendered
    // so idToken can be used in dependency arrays. ✅
    const { idToken } = oidc.getTokens();

    const user = useMemo(
        () =>
            decodeJwt(idToken) as {
                // Use https://jwt.io/ to tell what's in your idToken
                sub: string;
                preferred_username: string;
            },
        [idToken]
    );

    return { user };
}
