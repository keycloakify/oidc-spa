import { useOidc, enforceLogin, getOidc } from "~/oidc";
import { isKeycloak, createKeycloakUtils } from "oidc-spa/keycloak";
import type { Route } from "./+types/protected";

export async function clientLoader(params: Route.ClientLoaderArgs) {
    await enforceLogin(params);
}

export default function Protected() {
    // Here we can safely assume that the user is logged in.
    const { decodedIdToken, goToAuthServer, backFromAuthServer, renewTokens, issuerUri, clientId } =
        useOidc({
            assert: "user logged in"
        });

    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    return (
        <h4>
            Hello {decodedIdToken.name}
            <br />
            <br />
            <button onClick={() => renewTokens()}>Renew tokens </button>
            <br />
            {keycloakUtils !== undefined && (
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
                </>
            )}
        </h4>
    );
}
