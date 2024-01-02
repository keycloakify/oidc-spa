import { useOidc } from "oidc";
import { Link, useLocation } from "react-router-dom";

export function Header() {
    const { isUserLoggedIn, login, logout, oidcTokens } = useOidc();
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

            {isUserLoggedIn ? (
                <div>
                    <span>Hello {oidcTokens.decodedIdToken.preferred_username}</span>
                    &nbsp; &nbsp;
                    <button onClick={() => logout({ redirectTo: "home" })}>Logout</button>
                </div>
            ) : (
                <div>
                    <button onClick={() => login({ doesCurrentHrefRequiresAuth: false })}>Login</button>
                </div>
            )}
        </div>
    );
}
