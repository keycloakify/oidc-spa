import { Suspense } from "react";
import type { Route } from "./+types/_index";
import { useOidc } from "~/oidc";

export function meta({}: Route.MetaArgs) {
    return [
        { title: "oidc-spa + React Router Framework mode" },
        {
            name: "description",
            content: "A minimal React Router + oidc-spa demonstration with Tailwind CSS."
        }
    ];
}

export default function Home() {
    return (
        <section className="space-y-8">
            <div className="space-y-3">
                <p className="text-sm uppercase tracking-wide text-slate-400">Quick start</p>
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-semibold text-white pt-1 pb-1">
                        A calm place to try oidc-spa
                    </h1>
                    <Suspense>
                        <Greeting />
                    </Suspense>
                </div>
                <p className="text-base text-slate-300">
                    Use the header actions to authenticate, then explore the protected page to see how
                    user information and account actions surface in the UI.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <InfoCard
                    title="Sign in"
                    body="Header actions reflect your auth state and show the decoded ID token picture claim."
                />
                <InfoCard
                    title="Visit /protected"
                    body="Try the protected link; unauthenticated sessions are redirected to log in."
                />
                <InfoCard
                    title="Auto logout"
                    body="Inactivity-triggered logouts display a gentle overlay warning first."
                />
                <InfoCard
                    title="Switch provider"
                    body="Point .env.local at Auth0, Entra ID, Google OAuth or Keycloak (default)."
                />
                <InfoCard
                    title="Debug log"
                    body="Pop open devtools to see extra auth state logs from oidc-spa."
                />
                <InfoCard
                    title="Early render"
                    body="This demo renders immediately; drop the Suspense boundary if you prefer waiting."
                />
            </div>
        </section>
    );
}

function Greeting() {
    const { isUserLoggedIn, decodedIdToken } = useOidc();

    return (
        <div className="inline-flex items-center rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 animate-fade-in">
            {isUserLoggedIn ? `Signed in as ${decodedIdToken.name}` : `Browsing as a guest`}
        </div>
    );
}

function InfoCard({ title, body }: { title: string; body: string }) {
    return (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm shadow-slate-950/40">
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="mt-1 text-sm text-slate-300">{body}</p>
        </div>
    );
}
