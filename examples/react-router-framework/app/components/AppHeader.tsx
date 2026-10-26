import { Link, NavLink } from "react-router";
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
import { useOidc } from "~/oidc";

export function AppHeader() {
    const { isUserLoggedIn, user } = useOidc();

    return (
        <header className="app-header">
            <div className="header-inner">
                <Link to="/" className="brand">
                    My App
                </Link>
                <nav aria-label="Main navigation">
                    <NavLink to="/" end>
                        Home
                    </NavLink>
                    <NavLink to="/todo-list">Todo List</NavLink>
                    {isUserLoggedIn && user.canSeeAdminNavigation && (
                        <NavLink to="/todo-list-admin">Admin</NavLink>
                    )}
                </nav>
                <div className="actions">
                    <AuthButtons />
                </div>
            </div>
        </header>
    );
}

function AuthButtons() {
    const oidc = useOidc();

    return oidc.isUserLoggedIn ? <AuthButtonsLoggedIn /> : <AuthButtonsNotLoggedIn />;
}

function AuthButtonsLoggedIn() {
    const { user, logout } = useOidc({ assert: "user logged in" });

    return (
        <>
            <Link to="/account" className="avatar" aria-label="Open your account">
                {/* The avatar URL comes from the configured identity provider. */}
                <img
                    src={user.avatarImgUrl}
                    alt={`${user.displayName}'s avatar`}
                    width={32}
                    height={32}
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
            <button type="button" className="button-primary" onClick={() => login({})}>
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
