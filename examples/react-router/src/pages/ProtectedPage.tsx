import { useOidc } from "../oidc";
import { useMemo } from "react";
import { decodeJwt } from "oidc-spa/tools/decodeJwt";
import { parseKeycloakIssuerUri } from "oidc-spa/tools/parseKeycloakIssuerUri";

export default function ProtectedPage() {
    // Here we can safely assume that the user is logged in.
    const {
        tokens,
        decodedIdToken,
        goToAuthServer,
        backFromAuthServer,
        renewTokens,
        params: { issuerUri, clientId }
    } = useOidc({
        assert: "user logged in"
    });

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

    const parsedKeycloakIssuerUri = parseKeycloakIssuerUri(issuerUri);

    return (
        <h4>
            Hello {decodedIdToken.name}
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
