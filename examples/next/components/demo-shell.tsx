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
            <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
                <div className="mx-auto grid h-16 w-full max-w-4xl grid-cols-[auto_1fr_auto] items-center gap-4 px-6">
                    <div className="flex flex-col leading-tight">
                        <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                            Example
                        </span>
                        <span className="text-sm font-medium text-white">
                            oidc-spa · Next.js App Router
                        </span>
                    </div>

                    <nav className="flex items-center justify-center gap-4 text-sm font-medium text-slate-400">
                        <AppNavLink href="/">Home</AppNavLink>
                        <AppNavLink href="/protected">Protected</AppNavLink>
                        <AdminOnlyNavLink />
                    </nav>

                    <div className="flex min-w-40 justify-end sm:min-w-[220px]">
                        <AuthButtons />
                    </div>
                </div>
            </header>

            <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-10 px-6 pb-16 pt-28">
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
            className={`transition-colors ${isActive ? "text-white" : "hover:text-white"}`}
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
    const { decodedIdToken, logout, issuerUri, clientId, validRedirectUri } = useOidc({
        assert: "user logged in"
    });

    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    const accountUrl = keycloakUtils?.getAccountUrl({
        clientId,
        validRedirectUri,
        locale: undefined
    });

    const avatar = <Avatar picture={decodedIdToken.picture} name={decodedIdToken.name} />;

    return (
        <div className="flex items-center gap-4">
            {accountUrl ? (
                <a
                    className="flex items-center gap-3 text-sm font-medium text-slate-200 hover:text-white"
                    href={accountUrl}
                >
                    {avatar}
                </a>
            ) : (
                <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
                    {avatar}
                </div>
            )}
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

    if (!oidc.decodedIdToken.realm_access?.roles.includes("realm-admin")) {
        return null;
    }

    return <AppNavLink href="/admin-only">Admin</AppNavLink>;
}

function Avatar({ picture, name }: { picture?: string; name: string }) {
    if (picture && picture.trim().length > 0) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                alt={`${name}'s avatar`}
                className="h-10 w-10 shrink-0 rounded-full border border-slate-700 object-cover"
                src={picture}
            />
        );
    }

    return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-sm font-semibold text-slate-200">
            {name
                .split(" ")
                .map(part => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
        </div>
    );
}
