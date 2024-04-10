import { Link } from "@tanstack/react-router";
import { useOidc } from "oidc";

export function Header() {
    const { isUserLoggedIn, login, logout, oidcTokens, initializationError } = useOidc();

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
            {/* You do not have to display an error here, it's just to show that if you want you can
                But it's best to enable the user to navigate unauthenticated and to display an error
                only if he attemt to login (by default it display an alert) */}
            {initializationError !== undefined && (
                <div style={{ color: "red" }}>Initialization error: {initializationError.message}</div>
            )}

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
