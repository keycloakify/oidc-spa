import { Link } from "@tanstack/react-router";
import { useOidc } from "oidc";

export function Header() {
    const { isUserLoggedIn, login, logout, oidcTokens } = useOidc();
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
            <span>OIDC-SPA + Tanstack-router Starter</span>

            <div>
                <Link to="/">
                    {({ isActive }) => (
                        <span style={{ fontWeight: isActive ? "bold" : "normal" }}>Home</span>
                    )}
                </Link>
                &nbsp; &nbsp; &nbsp;
                <Link to="/protected">
                    {({ isActive }) => (
                        <span style={{ fontWeight: isActive ? "bold" : "normal" }}>
                            My protected page
                        </span>
                    )}
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
