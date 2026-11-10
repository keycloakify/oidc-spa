import { createFileRoute } from "@tanstack/react-router";
import { useOidc } from "@axa-fr/react-oidc";
import { keycloakAccountUrl } from "~/oidc";
import { useUser } from "~/user";

export const Route = createFileRoute("/_authenticated/account")({ component: AccountPage });

function AccountPage() {
    const { login } = useOidc();
    const user = useUser();
    if (!user) return null;

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
            <div className="actions">
                <button
                    type="button"
                    onClick={() => login("/account", { kc_action: "UPDATE_PASSWORD" })}
                >
                    Change password
                </button>
                <button type="button" onClick={() => login("/account", { kc_action: "UPDATE_PROFILE" })}>
                    Update profile
                </button>
                <button
                    type="button"
                    className="button-danger"
                    onClick={() => login("/account", { kc_action: "delete_account" })}
                >
                    Delete account
                </button>
            </div>
            <p>
                <a href={keycloakAccountUrl.href} target="_blank" rel="noreferrer">
                    Open the Keycloak account console
                </a>
            </p>
        </>
    );
}
