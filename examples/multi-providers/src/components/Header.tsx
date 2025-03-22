import { Link } from "@tanstack/react-router";
import {
    useIsUserLoggedIn,
    useOidc_assertUserLoggedIn,
    useOidc_assertUserNotLoggedIn,
    askUserToSelectProvider
} from "../oidc";

export function Header() {
    const isUserLoggedIn = useIsUserLoggedIn();

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
            <span>oidc-spa: Login with Google or Microsoft example</span>

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

            {isUserLoggedIn ? <LoggedInAuthButton /> : <NotLoggedInAuthButton />}
        </div>
    );
}

function LoggedInAuthButton() {
    const { decodedIdToken, logout } = useOidc_assertUserLoggedIn();

    return (
        <div>
            <span>Hello {decodedIdToken.name}</span>
            &nbsp; &nbsp;
            <button onClick={() => logout({ redirectTo: "home" })}>Logout</button>
        </div>
    );
}

function NotLoggedInAuthButton() {
    const oidcByProvider = useOidc_assertUserNotLoggedIn();

    return (
        <div>
            <button
                onClick={async () => {
                    const provider = await askUserToSelectProvider();

                    if (provider === undefined) {
                        return;
                    }

                    await oidcByProvider[provider].login({
                        doesCurrentHrefRequiresAuth: false
                    });
                }}
            >
                Login with Google or Microsoft
            </button>{" "}
        </div>
    );
}
