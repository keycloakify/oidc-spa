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
                    Use the header actions to authenticate, then explore your profile and account actions
                    or try the Todo app to save your personal tasks.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <InfoCard
                    body="Header actions reflect your auth state and show the avatar from your user profile."
                    title="Sign in"
                />
                <InfoCard
                    body="Try the protected link; unauthenticated sessions are redirected to log in."
                    title="Visit /protected"
                />
                <InfoCard
                    body="Add tasks, mark them complete, and find them waiting when you return."
                    title="Try the Todo app"
                />
                <InfoCard
                    body="Inactivity-triggered logouts display a gentle overlay warning first."
                    title="Auto logout"
                />
                <InfoCard
                    body="Point .env.local at Auth0, Entra ID, Google OAuth or Keycloak."
                    title="Switch provider"
                />
                <InfoCard
                    body="Pop open devtools to see extra auth state logs from oidc-spa."
                    title="Debug log"
                />
                <InfoCard
                    body="The auth client initializes early through instrumentation-client.ts."
                    title="Early init"
                />
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

function InfoCard({ title, body }: { title: string; body: string }) {
    return (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xs shadow-slate-950/40">
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="mt-1 text-sm text-slate-300">{body}</p>
        </div>
    );
}
