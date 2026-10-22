import { Link } from "@tanstack/react-router";
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
import { useOidc } from "~/oidc";

export function AppHeader() {
    return (
        <header style={{ display: "flex", alignItems: "center", gap: "2rem", flexWrap: "wrap" }}>
            <Link to="/">My App</Link>
            <nav aria-label="Main navigation" style={{ display: "flex", gap: "1rem", flex: 1 }}>
                <Link to="/">Home</Link>
                <Link to="/todo-list">Todo List</Link>
                <Link to="/todo-list-admin">Todo List Admin</Link>
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

    if (oidc.isUserLoggedIn) {
        return (
            <>
                <img
                    src={oidc.user.avatarImgUrl}
                    alt={`${oidc.user.displayName}'s avatar`}
                    width={32}
                    height={32}
                    style={{ borderRadius: "50%", objectFit: "cover" }}
                />
                <button type="button" onClick={() => oidc.logout({ returnToUrl: "/" })}>
                    Logout
                </button>
            </>
        );
    }

    const keycloakUtils = isKeycloak({ issuerUri: oidc.issuerUri })
        ? createKeycloakUtils({ issuerUri: oidc.issuerUri })
        : undefined;

    return (
        <>
            <button type="button" onClick={() => oidc.login({})}>
                Login
            </button>
            {keycloakUtils !== undefined && (
                <button
                    type="button"
                    onClick={() =>
                        oidc.login({
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
