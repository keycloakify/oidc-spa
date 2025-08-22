import { NavLink } from "react-router";
import { useOidc } from "../oidc.client";
import { parseKeycloakIssuerUri } from "oidc-spa/tools/parseKeycloakIssuerUri";
import { NoSsr } from "oidc-spa/react/tools/NoSsr";

export function Header() {
    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: 50
            }}
        >
            <div>
                <span>oidc-spa + react-router 7 framework mode</span>
                &nbsp; &nbsp; &nbsp; &nbsp;
                <NavLink to="/">
                    {({ isActive }) => (
                        <span style={{ fontWeight: isActive ? "bold" : "normal" }}>Home</span>
                    )}
                </NavLink>
                &nbsp; &nbsp; &nbsp;
                <NavLink to="/protected">
                    {({ isActive }) => (
                        <span style={{ fontWeight: isActive ? "bold" : "normal" }}>
                            My protected page
                        </span>
                    )}
                </NavLink>
            </div>

            {/* 
            Note that this component is mounted in the <Layout />
            component in root.tsx, this means that it will be
            server rendered at build time. As a consequence we must make 
            sure to wrap within <NoSsr /> boundaries any component that
            call the useOidc() hook.
            */}
            <NoSsr fallback={<span>Loading...</span>}>
                <AuthButton />
            </NoSsr>
        </div>
    );
}

function AuthButton() {
    const { isUserLoggedIn } = useOidc();

    return isUserLoggedIn ? <LoggedInAuthButton /> : <NotLoggedInAuthButton />;
}

function LoggedInAuthButton() {
    const { decodedIdToken, logout } = useOidc({ assert: "user logged in" });

    return (
        <div>
            <span>Hello {decodedIdToken.name}</span>
            &nbsp; &nbsp;
            <button onClick={() => logout({ redirectTo: "home" })}>Logout</button>
        </div>
    );
}

function NotLoggedInAuthButton() {
    let { login, params } = useOidc({ assert: "user not logged in" });

    const isKeycloak = parseKeycloakIssuerUri(params.issuerUri) !== undefined;

    const isAuth0 = params.issuerUri.includes("auth0");

    return (
        <div>
            <button onClick={() => login()}>Login</button>{" "}
            {isKeycloak && (
                <button
                    onClick={() =>
                        login({
                            transformUrlBeforeRedirect: url => {
                                const urlObj = new URL(url);

                                urlObj.pathname = urlObj.pathname.replace(/\/auth$/, "/registrations");

                                return urlObj.href;
                            }
                        })
                    }
                >
                    Register
                </button>
            )}
            {isAuth0 && (
                <button
                    onClick={() =>
                        login({
                            extraQueryParams: {
                                screen_hint: "signup"
                            }
                        })
                    }
                >
                    Register
                </button>
            )}
        </div>
    );
}
