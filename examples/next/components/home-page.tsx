"use client";

import { useOidc } from "@/lib/oidc";

export function HomePage() {
    return (
        <section className="space-y-8">
            <div className="space-y-3">
                <p className="text-sm uppercase tracking-wide text-slate-400">Quick start</p>
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="pb-1 pt-1 text-3xl font-semibold text-white">
                        A calm place to try oidc-spa
                    </h1>
                    <Greeting />
                </div>
                <p className="text-base text-slate-300">
                    Sign in to save your personal tasks in the Todo app. Open your account from the
                    avatar; admins can view everyone’s tasks in Todo Admin.
                </p>
            </div>
        </section>
    );
}

function Greeting() {
    const oidc = useOidc();

    return (
        <div className="inline-flex items-center rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200">
            {oidc.isUserLoggedIn ? `Signed in as ${oidc.user.displayName}` : "Browsing as a guest"}
        </div>
    );
}
