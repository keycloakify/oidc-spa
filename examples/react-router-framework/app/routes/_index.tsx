import { Suspense } from "react";
import type { Route } from "./+types/_index";
import { useOidc } from "~/oidc";

export function meta({}: Route.MetaArgs) {
    return [
        { title: "oidc-spa React Router example" },
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
                    body="The Auth button in the header show authentication state and the picture claim of the decoded id token."
                />
                <InfoCard
                    title="Visit /protected"
                    body="Click on the protected link in the header, if you're not already logged in you'll be redirected."
                />
                <InfoCard
                    title="Auto logout"
                    body="If the server is configured to automatically terminate session after inactivity you'll get an overlay warning."
                />
                <InfoCard
                    title="Switch provider"
                    body="The example is configured with a Keycloak but change the .env.local file and test against Auth0, EntraID or Google OAuth."
                />
                <InfoCard
                    title="Debug log"
                    body="Open the dev tool to see additional info about the auth state."
                />
                <InfoCard
                    title="Early render"
                    body="In this demo we start rendering immediately. If you don't like that, simply remove the the Suspense around the authed components."
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
