import { useOidc_assertUserLoggedIn, beforeLoad_protectedRoute } from "../oidc";
import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { decodeJwt } from "oidc-spa/tools/decodeJwt";

export const Route = createFileRoute("/protected")({
    component: ProtectedPage,
    beforeLoad: async params => {
        await beforeLoad_protectedRoute(params);
    }
});

function ProtectedPage() {
    // Here we can safely assume that the user is logged in.
    const { provider, tokens, decodedIdToken, renewTokens } = useOidc_assertUserLoggedIn();

    // WARNING: You are not supposed to decode the accessToken on the client side.
    // We are doing it here only for debugging purposes.
    const decodedAccessToken = useMemo(() => {
        if (tokens === undefined) {
            return undefined;
        }

        try {
            return decodeJwt(tokens.accessToken);
        } catch {
            return undefined;
        }
    }, [tokens]);

    return (
        <h4>
            Hello {decodedIdToken.name} (Logged in with {provider})
            <br />
            <br />
            {decodedAccessToken !== undefined ? (
                <>
                    <p>Decoded Access Token:</p>
                    <pre style={{ textAlign: "left" }}>
                        {JSON.stringify(decodedAccessToken, null, 2)}
                    </pre>
                </>
            ) : (
                <p>The Access Token issued by the IDP is opaque (Not a JWT).</p>
            )}
            <br />
            <button onClick={() => renewTokens()}>Renew tokens </button>
        </h4>
    );
}
