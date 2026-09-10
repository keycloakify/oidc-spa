"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
import { useOidc } from "@/lib/oidc";

const primaryButtonClasses =
    "inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-200";

export function DemoShell({ children }: { children: ReactNode }) {
    return (
        <>
            <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-sm">
                <div className="mx-auto grid w-full max-w-4xl grid-cols-[1fr_auto] items-center gap-4 px-6 py-3 sm:h-16 sm:grid-cols-[auto_1fr_auto] sm:py-0">
                    <div className="col-start-1 row-start-1 flex flex-col leading-tight">
                        <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                            Example
                        </span>
                        <span className="text-sm font-medium text-white">
                            oidc-spa · Next.js App Router
                        </span>
                    </div>

                    <nav className="col-span-2 col-start-1 row-start-2 flex items-center justify-center gap-4 text-sm font-medium text-slate-400 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                        <AppNavLink href="/">Home</AppNavLink>
                        <AppNavLink href="/todos">Todo app</AppNavLink>
                        <AdminOnlyNavLink />
                    </nav>

                    <div className="col-start-2 row-start-1 flex justify-end sm:col-start-3 sm:min-w-[180px]">
                        <AuthButtons />
                    </div>
                </div>
            </header>

            <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-10 px-6 pb-16 pt-36 sm:pt-28">
                {children}
            </main>
        </>
    );
}

function AppNavLink({ children, href }: { children: ReactNode; href: string }) {
    const pathname = usePathname();
    const isActive = pathname === href;

    return (
        <Link
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`transition-colors ${isActive ? "font-semibold text-white" : "hover:text-white"}`}
        >
            {children}
        </Link>
    );
}

function AuthButtons() {
    const oidc = useOidc();

    return oidc.isUserLoggedIn ? <LoggedInAuthButtons /> : <NotLoggedInAuthButtons />;
}

function LoggedInAuthButtons() {
    const { user, logout } = useOidc({
        assert: "user logged in"
    });

    const avatar = (
        // The avatar can come from any configured identity provider.
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={user.avatarImgUrl}
            alt={`${user.displayName}'s avatar`}
            className="h-10 w-10 shrink-0 rounded-full border border-slate-700 object-cover"
        />
    );

    return (
        <div className="flex items-center gap-4">
            <Link
                className="flex items-center gap-3 text-sm font-medium text-slate-200 hover:text-white"
                href="/account"
                aria-label="Open your account"
                title="Open your account"
            >
                {avatar}
            </Link>
            <button className={primaryButtonClasses} onClick={() => logout({ redirectTo: "home" })}>
                Logout
            </button>
        </div>
    );
}

function NotLoggedInAuthButtons() {
    const { login, issuerUri } = useOidc({ assert: "user not logged in" });

    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    return (
        <div className="flex items-center gap-3">
            <button className={primaryButtonClasses} onClick={() => login()}>
                Login
            </button>
            {keycloakUtils && (
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
    const oidc = useOidc();

    if (!oidc.isUserLoggedIn) {
        return null;
    }

    if (!oidc.user.canSeeKeycloakAdminNavigation) {
        return null;
    }

    return <AppNavLink href="/admin-only">Todo Admin</AppNavLink>;
}
