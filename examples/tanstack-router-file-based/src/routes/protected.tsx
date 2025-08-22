import { useOidc, enforceLogin, getOidc } from "../oidc";
import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { decodeJwt } from "oidc-spa/tools/decodeJwt";
import { parseKeycloakIssuerUri } from "oidc-spa/tools/parseKeycloakIssuerUri";

export const Route = createFileRoute("/protected")({
    component: ProtectedPage,
    beforeLoad: async params => {
        await enforceLogin(params);
        // If this line is reached, the user is logged in.
    }
});

function ProtectedPage() {
    // Here we can safely assume that the user is logged in.
    const {
        decodedIdToken,
        goToAuthServer,
        backFromAuthServer,
        renewTokens,
        params: { issuerUri, clientId }
    } = useOidc({
        assert: "user logged in"
    });

    const parsedKeycloakIssuerUri = parseKeycloakIssuerUri(issuerUri);

    const { decodedAccessToken } = useDecodedAccessToken_DIAGNOSTIC_ONLY();

    if (decodedAccessToken === undefined) {
        // Loading...
        return null;
    }

    return (
        <h4>
            Hello {decodedIdToken.name}
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
            <br />
            {parsedKeycloakIssuerUri !== undefined && (
                <>
                    <br />
                    <button
                        onClick={() =>
                            goToAuthServer({
                                extraQueryParams: { kc_action: "UPDATE_PASSWORD" }
                            })
                        }
                    >
                        Change password
                    </button>
                    {backFromAuthServer?.extraQueryParams.kc_action === "UPDATE_PASSWORD" && (
                        <p>Result: {backFromAuthServer.result.kc_action_status}</p>
                    )}
                    <br />
                    <button
                        onClick={() =>
                            goToAuthServer({
                                extraQueryParams: { kc_action: "UPDATE_PROFILE" }
                            })
                        }
                    >
                        Update profile
                    </button>
                    {backFromAuthServer?.extraQueryParams.kc_action === "UPDATE_PROFILE" && (
                        <p>Result: {backFromAuthServer.result.kc_action_status}</p>
                    )}
                    <br />
                    <button
                        onClick={() =>
                            goToAuthServer({
                                extraQueryParams: { kc_action: "delete_account" }
                            })
                        }
                    >
                        Delete account
                    </button>
                    <br />
                    <a
                        href={parsedKeycloakIssuerUri.getAccountUrl({
                            clientId,
                            backToAppFromAccountUrl: import.meta.env.BASE_URL
                        })}
                    >
                        Go to Keycloak Account Management Console
                    </a>
                </>
            )}
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
