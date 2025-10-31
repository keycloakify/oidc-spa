import { Suspense } from "react";
import { NavLink } from "react-router";
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
import { useOidc } from "~/oidc";
import userPictureFallback from "./userPictureFallback.svg";

export function Header() {
    return (
        <header className="fixed inset-x-0 top-0 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
            <div className="mx-auto grid h-16 w-full max-w-4xl grid-cols-[auto_1fr_auto] items-center gap-4 px-6">
                <div className="flex flex-col leading-tight">
                    <span className="text-xs uppercase tracking-wide text-slate-400">Example</span>
                    <span className="text-sm font-medium text-white">
                        oidc-spa · React Router declarative mode
                    </span>
                </div>

                <nav className="flex items-center justify-center gap-4 text-sm font-medium text-slate-400">
                    <NavLink
                        to="/"
                        className={({ isActive }) =>
                            `transition-colors ${isActive ? "text-white" : "hover:text-white"}`
                        }
                    >
                        Home
                    </NavLink>
                    <NavLink
                        to="/protected"
                        className={({ isActive }) =>
                            `transition-colors ${isActive ? "text-white" : "hover:text-white"}`
                        }
                    >
                        Protected
                    </NavLink>
                    <Suspense>
                        <AdminOnlyNavLink />
                    </Suspense>
                </nav>

                <div className="flex min-w-40 justify-end sm:min-w-[220px]">
                    <Suspense>
                        <AuthButtons />
                    </Suspense>
                </div>
            </div>
        </header>
    );
}

/**
 * You’ll notice that every component using `useOidc()` is wrapped in a `<Suspense />` boundary.
 * This is **optional**, but it helps control how your app loads.
 *
 * `useOidc()` will trigger suspense if it’s called before the OIDC initialization
 * process has completed.
 *
 * In this example, we place Suspense boundaries close to components that call `useOidc()`.
 * This allows the rest of the app to render immediately instead of waiting for OIDC initialization.
 *
 * What happens if you forget a Suspense?
 * React will fall back to the nearest Suspense boundary. If none exists nothing is rendered until oidc resolves.
 * This can be desirable if you prefer to avoid having to worry about layout shifts and display the
 * page app only when it’s fully ready.
 *
 * Note: `useOidc()` calls inside routes protected by `withLoginEnforced()` will **never suspend**,
 * since those routes are only reached after the initialization process completes.
 */
function AuthButtons() {
    const { isUserLoggedIn } = useOidc();

    return (
        <div className="animate-fade-in">
            {isUserLoggedIn ? <LoggedInAuthButtons /> : <NotLoggedInAuthButtons />}
        </div>
    );
}

const primaryButtonClasses =
    "inline-flex items-center rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-white";

function LoggedInAuthButtons() {
    const { decodedIdToken, logout, issuerUri, clientId, validRedirectUri } = useOidc({
        assert: "user logged in"
    });

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
                    validRedirectUri
                })}
                className="flex items-center gap-3 text-sm font-medium text-slate-200 hover:text-white"
            >
                <img
                    src={profileImageSrc}
                    alt={`${decodedIdToken.name}'s avatar`}
                    className="h-10 w-10 shrink-0 rounded-full border border-slate-700 object-cover"
                />
            </a>
            <button className={primaryButtonClasses} onClick={() => logout({ redirectTo: "home" })}>
                Logout
            </button>
        </div>
    );
}

function NotLoggedInAuthButtons() {
    const { login, issuerUri } = useOidc({ assert: "user not logged in" });

    const keycloakUtils = !isKeycloak({ issuerUri }) ? undefined : createKeycloakUtils({ issuerUri });

    return (
        <div className="flex items-center gap-3">
            <button className={primaryButtonClasses} onClick={() => login()}>
                Login
            </button>
            {keycloakUtils !== undefined && (
                <button
                    className="inline-flex items-center rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-slate-500"
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
        </div>
    );
}

function AdminOnlyNavLink() {
    const { isUserLoggedIn, decodedIdToken } = useOidc();

    if (!isUserLoggedIn) {
        return null;
    }

    if (!decodedIdToken.realm_access?.roles.includes("realm-admin")) {
        return null;
    }

    return (
        <NavLink
            to="/admin-only"
            className={({ isActive }) =>
                `transition-colors ${isActive ? "text-white" : "hover:text-white"}`
            }
        >
            Admin
        </NavLink>
    );
}
