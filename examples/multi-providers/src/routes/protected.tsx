import { useOidc_assertUserLoggedIn, beforeLoad_protectedRoute, getOidc } from "../oidc";
import { useEffect, useState } from "react";
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
    const { provider, decodedIdToken, renewTokens } = useOidc_assertUserLoggedIn();

    const { decodedAccessToken } = useDecodedAccessToken_DIAGNOSTIC_ONLY();

    if (decodedAccessToken === undefined) {
        // Loading...
        return null;
    }

    return (
        <h4>
            Hello {decodedIdToken.name} (Logged in with {provider})
            <br />
            <br />
            {decodedAccessToken !== null ? (
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

/**
 * DIAGNOSTIC ONLY
 *
 * In real applications you should not read, display, or depend on any fields
 * from the access token. Treat it as an opaque string and use it only as:
 *
 *   Authorization: Bearer <token>
 *
 * If you need user information, use decodedIdToken or fetch it from your backend.
 * Please read the documentation or ask on our Discord if you are unsure.
 * Do not copy this pattern into production code.
 */
function useDecodedAccessToken_DIAGNOSTIC_ONLY() {
    const [decodedAccessToken, setDecodedAccessToken] = useState<
        Record<string, unknown> | null /* Opaque, not a JWT */ | undefined /* Loading */
    >(undefined);

    useEffect(() => {
        let cleanup: (() => void) | undefined = undefined;
        let isActive = true;

        (async () => {
            const oidc = await getOidc();

            if (!isActive) {
                return;
            }

            if (!oidc.isUserLoggedIn) {
                throw new Error("Assertion error");
            }

            const update = (accessToken: string) => {
                let decodedAccessToken: Record<string, unknown> | null;

                try {
                    decodedAccessToken = decodeJwt(accessToken);
                } catch {
                    decodedAccessToken = null;
                }

                setDecodedAccessToken(decodedAccessToken);
            };

            const { unsubscribe } = oidc.subscribeToTokensChange(tokens => update(tokens.accessToken));

            cleanup = () => {
                unsubscribe();
            };

            {
                const { accessToken } = await oidc.getTokens();

                if (!isActive) {
                    return;
                }

                update(accessToken);
            }
        })();

        return () => {
            isActive = false;
            cleanup?.();
        };
    }, []);

    return { decodedAccessToken };
}
