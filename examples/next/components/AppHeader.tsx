"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { createKeycloakUtils, isKeycloak } from "oidc-spa/keycloak";
import { useOidc } from "@/lib/oidc";

export function AppHeader() {
    const { isUserLoggedIn, user } = useOidc();

    return (
        <header className="app-header">
            <div className="header-inner">
                <Link href="/" className="brand">
                    My App
                </Link>
                <nav aria-label="Main navigation">
                    <AppNavLink href="/">Home</AppNavLink>
                    <AppNavLink href="/todo-list-trpc">Todos · tRPC</AppNavLink>
                    <AppNavLink href="/todo-list-api">Todos · API</AppNavLink>
                    {isUserLoggedIn && user.canSeeAdminNavigation && (
                        <AppNavLink href="/todo-list-admin">Admin</AppNavLink>
                    )}
                </nav>
                <div className="actions">
                    <AuthButtons />
                </div>
            </div>
        </header>
    );
}

function AuthButtons() {
    const oidc = useOidc();

    return oidc.isUserLoggedIn ? <AuthButtonsLoggedIn /> : <AuthButtonsNotLoggedIn />;
}

function AuthButtonsLoggedIn() {
    const { user, logout } = useOidc({ assert: "user logged in" });

    return (
        <>
            <Link href="/account" className="avatar" aria-label="Open your account">
                {/* The avatar URL comes from the configured identity provider. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={user.avatarImgUrl}
                    alt={`${user.displayName}'s avatar`}
                    width={32}
                    height={32}
                />
            </Link>
            <button type="button" onClick={() => logout()}>
                Logout
            </button>
        </>
    );
}

function AuthButtonsNotLoggedIn() {
    const { login, issuerUri } = useOidc({ assert: "user not logged in" });

    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    return (
        <>
            <button type="button" className="button-primary" onClick={() => login({})}>
                Login
            </button>
            {keycloakUtils !== undefined && (
                <button
                    type="button"
                    onClick={() =>
                        login({
                            transformAuthorizationUrl: keycloakUtils.transformAuthorizationUrl_register
                        })
                    }
                >
                    Register
                </button>
            )}
        </>
    );
}

function AppNavLink({ href, children }: { href: string; children: ReactNode }) {
    const pathname = usePathname();
    return (
        <Link href={href} aria-current={pathname === href ? "page" : undefined}>
            {children}
        </Link>
    );
}
