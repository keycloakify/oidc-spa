import { Link } from "@tanstack/react-router";
import { useOidc } from "@axa-fr/react-oidc";
import { useUser } from "~/user";

export function AppHeader() {
    const { isAuthenticated, login, logout } = useOidc();
    const user = useUser();
    const returnTo = window.location.pathname + window.location.search + window.location.hash;

    return (
        <header className="app-header">
            <div className="header-inner">
                <Link to="/" className="brand">
                    My App
                </Link>
                <nav aria-label="Main navigation">
                    <Link to="/" activeOptions={{ exact: true }}>
                        Home
                    </Link>
                    <Link to="/todo-list-trpc">Todos · tRPC</Link>
                    <Link to="/todo-list-api">Todos · API</Link>
                    {isAuthenticated && user?.canSeeAdminNavigation && (
                        <Link to="/todo-list-admin">Admin</Link>
                    )}
                </nav>
                <div className="actions">
                    {isAuthenticated ? (
                        <>
                            {user && (
                                <Link to="/account" className="avatar" aria-label="Open your account">
                                    <img
                                        src={user.avatarImgUrl}
                                        alt={`${user.displayName}'s avatar`}
                                        width={32}
                                        height={32}
                                    />
                                </Link>
                            )}
                            <button type="button" onClick={() => logout("/")}>
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="button-primary"
                                onClick={() => login(returnTo)}
                            >
                                Login
                            </button>
                            <button type="button" onClick={() => login(returnTo, { prompt: "create" })}>
                                Register
                            </button>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
