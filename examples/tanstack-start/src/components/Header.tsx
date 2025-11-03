import { Link } from "@tanstack/react-router";

import { useState } from "react";
import { ChevronDown, ChevronRight, Home, Menu, Server, X } from "lucide-react";
import { createOidcComponent } from "@/oidc";
import { isKeycloak, createKeycloakUtils } from "oidc-spa/keycloak";

import userPictureFallback from "./userPictureFallback.svg";

export default function Header() {
    const [isOpen, setIsOpen] = useState(false);
    const [groupedExpanded, setGroupedExpanded] = useState<Record<string, boolean>>({});

    return (
        <>
            <header className="p-4 flex items-center bg-gray-800 text-white shadow-lg">
                <button
                    onClick={() => setIsOpen(true)}
                    className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                    aria-label="Open menu"
                >
                    <Menu size={24} />
                </button>
                <h1 className="ml-4 text-xl font-semibold">
                    <Link to="/">
                        <img src="/tanstack-word-logo-white.svg" alt="TanStack Logo" className="h-10" />
                    </Link>
                </h1>
                <AuthButtons className="ml-auto" />
            </header>

            <aside
                className={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
                    isOpen ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold">Navigation</h2>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                        aria-label="Close menu"
                    >
                        <X size={24} />
                    </button>
                </div>

                <nav className="flex-1 p-4 overflow-y-auto">
                    <Link
                        to="/"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                        activeProps={{
                            className:
                                "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2"
                        }}
                    >
                        <Home size={20} />
                        <span className="font-medium">Home</span>
                    </Link>

                    {/* Demo Links Start */}

                    <Link
                        to="/demo/start/server-funcs"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                        activeProps={{
                            className:
                                "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2"
                        }}
                    >
                        <Server size={20} />
                        <span className="font-medium">Authed Server Functions</span>
                    </Link>

                    <Link
                        to="/demo/start/api-request"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                        activeProps={{
                            className:
                                "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2"
                        }}
                    >
                        <Server size={20} />
                        <span className="font-medium">Authed API Request</span>
                    </Link>

                    <AdminOnlyNavLink onClick={() => setIsOpen(false)} />

                    <div className="flex flex-row justify-between">
                        <Link
                            to="/demo/start/ssr"
                            onClick={() => setIsOpen(false)}
                            className="flex-1 flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                            activeProps={{
                                className:
                                    "flex-1 flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2"
                            }}
                        >
                            <Server size={20} />
                            <span className="font-medium">Start - SSR Demos</span>
                        </Link>
                        <button
                            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                            onClick={() =>
                                setGroupedExpanded(prev => ({
                                    ...prev,
                                    StartSSRDemo: !prev.StartSSRDemo
                                }))
                            }
                        >
                            {groupedExpanded.StartSSRDemo ? (
                                <ChevronDown size={20} />
                            ) : (
                                <ChevronRight size={20} />
                            )}
                        </button>
                    </div>
                    {groupedExpanded.StartSSRDemo && (
                        <div className="flex flex-col ml-4">
                            <Link
                                to="/demo/start/ssr/spa-mode"
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                                activeProps={{
                                    className:
                                        "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2"
                                }}
                            >
                                <Server size={20} />
                                <span className="font-medium">SPA Mode</span>
                            </Link>

                            <Link
                                to="/demo/start/ssr/full-ssr"
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                                activeProps={{
                                    className:
                                        "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2"
                                }}
                            >
                                <Server size={20} />
                                <span className="font-medium">Full SSR</span>
                            </Link>

                            <Link
                                to="/demo/start/ssr/data-only"
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                                activeProps={{
                                    className:
                                        "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2"
                                }}
                            >
                                <Server size={20} />
                                <span className="font-medium">Data Only</span>
                            </Link>
                        </div>
                    )}

                    {/* Demo Links End */}
                </nav>
            </aside>
        </>
    );
}

const AuthButtons = createOidcComponent({
    pendingComponent: () => null,
    component: (props: { className?: string }) => {
        const { className } = props;

        const { isUserLoggedIn } = AuthButtons.useOidc();

        return (
            <div className={["opacity-0 animate-[fadeIn_0.2s_ease-in_forwards]", className].join(" ")}>
                {isUserLoggedIn ? <LoggedInAuthButton /> : <NotLoggedInAuthButton />}
            </div>
        );
    }
});

const LoggedInAuthButton = createOidcComponent({
    assert: "user logged in",
    component: () => {
        const { decodedIdToken, logout } = LoggedInAuthButton.useOidc();

        return (
            <div className="flex items-center gap-4">
                <Link
                    to="/account"
                    className="flex items-center gap-3 text-white font-semibold hover:text-cyan-300 transition-colors"
                >
                    <img
                        src={decodedIdToken.picture || userPictureFallback}
                        alt={`${decodedIdToken.name}'s avatar`}
                        className="w-10 h-10 rounded-full object-cover border border-cyan-500/60 shadow-lg shrink-0"
                    />
                </Link>
                <button
                    className="px-8 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/50"
                    onClick={() => logout({ redirectTo: "home" })}
                >
                    Logout
                </button>
            </div>
        );
    }
});

const NotLoggedInAuthButton = createOidcComponent({
    assert: "user not logged in",
    component: () => {
        const { login, issuerUri } = NotLoggedInAuthButton.useOidc();

        const keycloakUtils = !isKeycloak({ issuerUri })
            ? undefined
            : createKeycloakUtils({ issuerUri });

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
});

const AdminOnlyNavLink = createOidcComponent({
    component: (props: { onClick: () => void }) => {
        const { onClick } = props;

        const { isUserLoggedIn, decodedIdToken } = AdminOnlyNavLink.useOidc();

        if (!isUserLoggedIn) {
            return null;
        }

        if (!decodedIdToken.realm_access?.roles.includes("realm-admin")) {
            return null;
        }

        return (
            <Link
                to="/demo/start/admin-only"
                onClick={onClick}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
                activeProps={{
                    className:
                        "flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2"
                }}
            >
                <Server size={20} />
                <span className="font-medium">Admin (Claim based Authorization Demo)</span>
            </Link>
        );
    }
});
