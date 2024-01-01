import { useOidc, useUser } from "oidc";
import { Link, useLocation } from "react-router-dom";

export function Header() {
    const { oidc } = useOidc();
    const { pathname } = useLocation();

    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%"
            }}
        >
            <span>OIDC-SPA + React-router Starter</span>

            <div>
                <Link to="/" style={{ fontWeight: pathname === "/" ? "bold" : "normal" }}>
                    Home
                </Link>
                &nbsp; &nbsp; &nbsp;
                <Link
                    to="/protected"
                    style={{ fontWeight: pathname === "/protected" ? "bold" : "normal" }}
                >
                    My protected page
                </Link>
            </div>

            {oidc.isUserLoggedIn ? (
                <AuthSectionLoggedId logout={() => oidc.logout({ redirectTo: "home" })} />
            ) : (
                <AuthSectionNotAuthenticated
                    login={() => oidc.login({ doesCurrentHrefRequiresAuth: false })}
                />
            )}
        </div>
    );
}

function AuthSectionLoggedId(props: { logout: () => void }) {
    const { logout } = props;

    const { user } = useUser();

    return (
        <div>
            <span>Hello {user.preferred_username}!</span>
            &nbsp; &nbsp;
            <button onClick={logout}>Logout</button>
        </div>
    );
}

function AuthSectionNotAuthenticated(props: { login: () => void }) {
    const { login } = props;

    return (
        <div>
            <button onClick={login}>Login</button>
        </div>
    );
}
