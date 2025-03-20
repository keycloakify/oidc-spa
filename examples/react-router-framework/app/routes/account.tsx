import { useOidc, enforceLogin } from "../oidc.client";
import { parseKeycloakIssuerUri } from "oidc-spa/tools/parseKeycloakIssuerUri";
import type { Route } from "./+types/account";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
    await enforceLogin(request);
}

export function HydrateFallback() {
    return <div>Loading...</div>;
}

export default function Account() {
    const {
        goToAuthServer,
        backFromAuthServer,
        params: { issuerUri, clientId }
    } = useOidc({ assert: "user logged in" });

    const keycloak = parseKeycloakIssuerUri(issuerUri);

    if (keycloak === undefined) {
        throw new Error("We expect Keycloak to be the OIDC provider of this App");
    }

    return (
        <div>
            <h1>Account</h1>
            <p>
                <a
                    href={keycloak.getAccountUrl({
                        clientId,
                        backToAppFromAccountUrl: location.href,
                        locale: "en"
                    })}
                >
                    Go to Keycloak Account Management Page
                </a>
            </p>
            <p>
                <button
                    onClick={() =>
                        goToAuthServer({
                            extraQueryParams: {
                                kc_action: "CHANGE_PASSWORD"
                            }
                        })
                    }
                >
                    Change My Password
                </button>
                {backFromAuthServer?.extraQueryParams.kc_action === "CHANGE_PASSWORD" && (
                    <span>
                        {backFromAuthServer.result.kc_action_status === "success"
                            ? "Password Updated!"
                            : "Password unchanged"}
                    </span>
                )}
            </p>
            <p>
                <button
                    onClick={() =>
                        goToAuthServer({
                            extraQueryParams: {
                                kc_action: "UPDATE_PROFILE"
                            }
                        })
                    }
                >
                    Update My Profile Information
                </button>
                {backFromAuthServer?.extraQueryParams.kc_action === "UPDATE_PROFILE" && (
                    <span>
                        {backFromAuthServer.result.kc_action_status === "success"
                            ? "Profile Updated!"
                            : "Profile unchanged"}
                    </span>
                )}
            </p>
            <p>
                <button
                    onClick={() =>
                        goToAuthServer({
                            extraQueryParams: {
                                kc_action: "delete_account"
                            }
                        })
                    }
                >
                    Delete My Account
                </button>
            </p>
        </div>
    );
}
