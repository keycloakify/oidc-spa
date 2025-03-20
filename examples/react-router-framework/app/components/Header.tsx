import { useMemo } from "react";
import { useOidc } from "../oidc.client";
import { parseKeycloakIssuerUri } from "oidc-spa/tools/parseKeycloakIssuerUri";
import { Link } from "react-router";

export default function Header() {
    const { isUserLoggedIn } = useOidc();

    return (
        <header>
            <nav>
                <Link to="/">Home</Link>
                <Link to="todo-list">Orders</Link>
            </nav>
            {isUserLoggedIn ? <AuthButtonsLoggedIn /> : <AuthButtonsNotLoggedIn />}
        </header>
    );
}

function AuthButtonsLoggedIn() {
    const { decodedIdToken, logout, params } = useOidc({ assert: "user logged in" });

    return (
        <div>
            <span>Logged in as {decodedIdToken.name}</span>
            {parseKeycloakIssuerUri(params.issuerUri) !== undefined && <Link to="account">Account</Link>}
            <button onClick={() => logout({ redirectTo: "home" })}>Logout</button>
        </div>
    );
}

function AuthButtonsNotLoggedIn() {
    const { login, params } = useOidc({ assert: "user not logged in" });

    const oidcProvider = useMemo(() => {
        if (parseKeycloakIssuerUri(params.issuerUri) !== undefined) {
            return "keycloak";
        }

        if (params.issuerUri.includes("auth0")) {
            return "auth0";
        }

        return undefined;
    }, []);

    return (
        <div>
            <button onClick={() => login()}>Login</button>
            {oidcProvider !== undefined && (
                <button
                    onClick={() => {
                        switch (oidcProvider) {
                            case "keycloak":
                                login({
                                    transformUrlBeforeRedirect: url => {
                                        const urlObj = new URL(url);
                                        urlObj.pathname = urlObj.pathname.replace(
                                            /\/auth$/,
                                            "/registrations"
                                        );
                                        return urlObj.href;
                                    }
                                });
                                break;
                            case "auth0":
                                login({
                                    extraQueryParams: { screen_hint: "signup" }
                                });
                                break;
                        }
                    }}
                >
                    Register
                </button>
            )}
        </div>
    );
}
