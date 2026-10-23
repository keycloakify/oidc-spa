"use client";

import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
import { useOidc } from "@/lib/oidc";

export function AccountPage() {
    const { user, issuerUri, clientId, validRedirectUri, startAuthorization, authorizationResult } =
        useOidc({ assert: "user logged in" });

    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    return (
        <>
            <h1>Account</h1>
            <p>Your profile and account settings.</p>
            <dl>
                <dt>Name</dt>
                <dd>{user.displayName}</dd>
                {user.email && (
                    <>
                        <dt>Email</dt>
                        <dd>{user.email}</dd>
                    </>
                )}
            </dl>
            {keycloakUtils !== undefined && (
                <>
                    <div className="actions">
                        <button
                            type="button"
                            onClick={() =>
                                startAuthorization({
                                    authorizationParams: { kc_action: "UPDATE_PASSWORD" }
                                })
                            }
                        >
                            Change password
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                startAuthorization({
                                    authorizationParams: { kc_action: "UPDATE_PROFILE" }
                                })
                            }
                        >
                            Update profile
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                startAuthorization({
                                    authorizationParams: { kc_action: "delete_account" }
                                })
                            }
                            className="button-danger"
                        >
                            Delete account
                        </button>
                    </div>
                    {authorizationResult?.authorizationParams.kc_action && (
                        <p role="status">
                            Result for {authorizationResult.authorizationParams.kc_action}:{" "}
                            {authorizationResult.response.kc_action_status}
                        </p>
                    )}
                    <p>
                        <a
                            href={keycloakUtils.getAccountUrl({ clientId, validRedirectUri })}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Open the Keycloak account console
                        </a>
                    </p>
                </>
            )}
        </>
    );
}
