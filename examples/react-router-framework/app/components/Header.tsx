import { Suspense } from "react";
import { NavLink } from "react-router";
import { useOidc } from "~/oidc";
import { isKeycloak, createKeycloakUtils } from "oidc-spa/keycloak";

import userPictureFallback from "./userPictureFallback.svg";

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

            <Suspense>
                <AuthButtons />
            </Suspense>
        </div>
    );
}

function AuthButtons() {
    const { isUserLoggedIn } = useOidc();

    return isUserLoggedIn ? <LoggedInAuthButtons /> : <NotLoggedInAuthButtons />;
}

function LoggedInAuthButtons() {
    const { decodedIdToken, logout, issuerUri, clientId } = useOidc({ assert: "user logged in" });

    const keycloakUtils = !isKeycloak({ issuerUri }) ? undefined : createKeycloakUtils({ issuerUri });

    const profileImageSrc =
        decodedIdToken.picture && decodedIdToken.picture.trim().length > 0
            ? decodedIdToken.picture
            : userPictureFallback;

    return (
        <div className="flex items-center gap-4">
            <a
                href={keycloakUtils?.getAccountUrl({
                    clientId,
                    backToAppFromAccountUrl: location.href
                })}
                className="flex items-center gap-3 text-white font-semibold hover:text-cyan-300 transition-colors"
            >
                <img
                    src={profileImageSrc}
                    alt={`${decodedIdToken.name}'s avatar`}
                    className="w-10 h-10 rounded-full object-cover border border-cyan-500/60 shadow-lg shrink-0"
                />
            </a>
            <button
                className="px-8 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/50"
                onClick={() => logout({ redirectTo: "home" })}
            >
                Logout
            </button>
        </div>
    );
}

function NotLoggedInAuthButtons() {
    const { login, issuerUri } = useOidc({ assert: "user not logged in" });

    const keycloakUtils = !isKeycloak({ issuerUri }) ? undefined : createKeycloakUtils({ issuerUri });

    return (
        <>
            <button
                className="px-8 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/50"
                onClick={() => login()}
            >
                Login
            </button>
            &nbsp;
            {keycloakUtils !== undefined && (
                <button
                    className="px-8 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/50"
                    onClick={() =>
                        login({
                            transformUrlBeforeRedirect:
                                keycloakUtils.transformUrlBeforeRedirectForRegister
                        })
                    }
                >
                    Register
                </button>
            )}
        </>
    );
}
