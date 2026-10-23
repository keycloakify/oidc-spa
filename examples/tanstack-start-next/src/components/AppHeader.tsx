import { Link } from "@tanstack/react-router";
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
import { useOidc } from "~/oidc";

export function AppHeader() {
    const { isUserLoggedIn, user } = useOidc();

    return (
        <header style={{ display: "flex", alignItems: "center", gap: "2rem", flexWrap: "wrap" }}>
            <Link to="/">My App</Link>
            <nav aria-label="Main navigation" style={{ display: "flex", gap: "1rem", flex: 1 }}>
                <Link to="/">Home</Link>
                <Link to="/todo-list-server-function">Todo List (Server Function)</Link>
                <Link to="/todo-list-api">Todo List (API)</Link>
                {isUserLoggedIn && user.canSeeAdminNavigation && (
                    <Link to="/todo-list-admin">Todo List Admin</Link>
                )}
            </nav>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AuthButtons />
            </div>
        </header>
    );
}

function AuthButtons() {
    const oidc = useOidc();

    if (!oidc.isOidcReady) {
        return null;
    }

    return oidc.isUserLoggedIn ? <AuthButtonsLoggedIn /> : <AuthButtonsNotLoggedIn />;
}

function AuthButtonsLoggedIn() {
    const { user, logout } = useOidc({ assert: "user logged in" });

    return (
        <>
            <Link to="/account" aria-label="Open your account">
                <img
                    src={user.avatarImgUrl}
                    alt={`${user.displayName}'s avatar`}
                    width={32}
                    height={32}
                    style={{ borderRadius: "50%", objectFit: "cover" }}
                />
            </Link>
            <button type="button" onClick={() => logout()}>
                Logout
            </button>
        </>
    );
}

function AuthButtonsNotLoggedIn() {
    const { login, issuerUri } = useOidc({ assert: "user not logged in" });

    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    return (
        <>
            <button type="button" onClick={() => login({})}>
                Login
            </button>
            {keycloakUtils !== undefined && (
                <button
                    type="button"
                    onClick={() =>
                        login({
                            transformAuthorizationUrl: keycloakUtils.transformAuthorizationUrl_register
                        })
                    }
                >
                    Register
                </button>
            )}
        </>
    );
}
