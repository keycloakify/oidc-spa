import { Suspense } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, ShieldCheck, ExternalLink, ListTodo, Server, Sparkles } from "lucide-react";
import { createOidcComponent } from "@/oidc";

export const Route = createFileRoute("/")({ component: App });

function App() {
    return (
        <div className="flex flex-1 flex-col min-h-full bg-linear-to-b from-slate-900 via-slate-800 to-slate-900">
            {/* Hero */}
            <section className="relative py-16 px-6 text-center overflow-hidden">
                <div className="absolute inset-0 bg-linear-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10" />
                <div className="relative max-w-5xl mx-auto">
                    <div className="flex items-center justify-center gap-6 mb-4">
                        <img
                            src="/tanstack-circle-logo.png"
                            alt="TanStack Logo"
                            className="w-24 h-24 md:w-28 md:h-28"
                        />
                        <h1 className="text-5xl md:text-6xl font-bold text-white">
                            <span className="text-gray-300">TanStack</span>{" "}
                            <span className="bg-linear-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                                Start
                            </span>
                        </h1>
                    </div>
                    <p className="text-xl md:text-2xl text-gray-300 mb-2 font-light">
                        <Greeting />
                    </p>
                    <p className="text-base md:text-lg text-gray-400 max-w-3xl mx-auto">
                        A lightly modified TanStack Start starter showcasing authentication and
                        authorization with
                        <span className="ml-2 px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white">
                            oidc-spa
                        </span>
                        .
                    </p>
                </div>
            </section>

            {/* What is this? */}
            <section className="px-6 pt-6 pb-4">
                <div className="max-w-5xl mx-auto p-6 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10">
                    <div className="flex items-center gap-3 mb-3">
                        <Sparkles className="w-6 h-6 text-cyan-300" />
                        <h2 className="text-2xl font-semibold text-white">What you’re looking at</h2>
                    </div>
                    <p className="text-white/90 mb-4">
                        This is the standard TanStack Start template with a focused addition: we
                        integrated
                        <code className="mx-2 px-2 py-0.5 rounded bg-white/10 border border-white/20">
                            oidc-spa
                        </code>
                        to provide a complete authentication and authorization story.
                    </p>
                    <ul className="text-white/90 space-y-2 list-disc ml-6">
                        <li>
                            By default, it connects to a hosted Keycloak demo. Sign in with GitHub or
                            create an account.
                        </li>
                        <li>
                            To try other providers, edit your environment in{" "}
                            <code className="px-1.5 py-0.5 bg-white/10 border border-white/20 rounded">
                                .env
                            </code>
                            . A ready-to-edit example lives in{" "}
                            <code className="px-1.5 py-0.5 bg-white/10 border border-white/20 rounded">
                                .env.sample
                            </code>
                            . We include Auth0, Microsoft Entra ID, and Google OAuth guidance.
                        </li>
                        <li>
                            Want to test completely offline? Set{" "}
                            <code className="px-1.5 py-0.5 bg-white/10 border border-white/20 rounded">
                                OIDC_USE_MOCK=true
                            </code>{" "}
                            to use a mock identity.
                        </li>
                    </ul>
                </div>
            </section>

            {/* Explore the demos */}
            <section className="px-6 py-6">
                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Link
                        to="/demo/start/server-funcs"
                        className="block bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <Server className="w-6 h-6 text-cyan-400" />
                            <h3 className="text-xl font-semibold text-white">Authed Server Functions</h3>
                        </div>
                        <p className="text-gray-300">
                            A todo list powered by server functions. Items are per-user, not public.
                        </p>
                    </Link>

                    <Link
                        to="/demo/start/api-request"
                        className="block bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <ListTodo className="w-6 h-6 text-cyan-400" />
                            <h3 className="text-xl font-semibold text-white">Authed API Request</h3>
                        </div>
                        <p className="text-gray-300">
                            Same todo concept, fetched from a protected REST endpoint.
                        </p>
                    </Link>

                    <Link
                        to="/demo/start/admin-only"
                        className="block bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <ShieldCheck className="w-6 h-6 text-emerald-300" />
                            <h3 className="text-xl font-semibold text-white">
                                Admin-Only Authorization
                            </h3>
                        </div>
                        <p className="text-gray-300">
                            Demonstrates claim-based authorization. Server functions and API routes both
                            enforce the
                            <code className="mx-1 px-1.5 py-0.5 bg-white/10 border border-white/20 rounded">
                                realm-admin
                            </code>{" "}
                            role.
                        </p>
                    </Link>
                </div>
            </section>

            {/* For streaming */}
            <Suspense>
                {/* Auto-logout & SSR story */}
                <section className="px-6 pb-10">
                    <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10">
                            <div className="flex items-center gap-3 mb-2">
                                <Lock className="w-6 h-6 text-cyan-300" />
                                <h3 className="text-xl font-semibold text-white">Auto‑Logout Overlay</h3>
                            </div>
                            <p className="text-white/90">
                                You’ll see an overlay warning before SSO session expiry. For demo
                                purposes, the session is short (~6 minutes of inactivity). When the
                                countdown appears, any activity dismisses it.
                                <a
                                    href="https://docs.oidc-spa.dev/v/v8/features/auto-logout"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 ml-2 text-cyan-300 hover:text-cyan-200"
                                >
                                    Learn more <ExternalLink className="w-4 h-4" />
                                </a>
                            </p>
                        </div>

                        <div className="p-6 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10">
                            <div className="flex items-center gap-3 mb-2">
                                <Server className="w-6 h-6 text-cyan-300" />
                                <h3 className="text-xl font-semibold text-white">
                                    SSR without the stress
                                </h3>
                            </div>
                            <p className="text-white/90">
                                In oidc-spa, the client owns auth. Your server doesn’t need to know about
                                it. You can still use SSR broadly—auth‑aware pieces are delayed to the
                                client and show their
                                <code className="mx-1 px-1.5 py-0.5 bg-white/10 border border-white/20 rounded">
                                    pendingComponent
                                </code>
                                until ready. The build tooling takes care of this automatically.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Helpful links */}
                <section className="px-6 pb-16">
                    <div className="max-w-5xl mx-auto text-center">
                        <div className="inline-flex flex-wrap items-center justify-center gap-3">
                            <a
                                href="https://docs.oidc-spa.dev"
                                target="_blank"
                                rel="noreferrer"
                                className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/30"
                            >
                                oidc-spa Docs
                            </a>
                            <a
                                href="https://docs.oidc-spa.dev/resources/discord-server"
                                target="_blank"
                                rel="noreferrer"
                                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
                            >
                                Discord
                            </a>
                            <a
                                href="https://tanstack.com/start"
                                target="_blank"
                                rel="noreferrer"
                                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
                            >
                                TanStack Start
                            </a>
                        </div>
                    </div>
                </section>
            </Suspense>
        </div>
    );
}

const Greeting = createOidcComponent({
    pendingComponent: () => <>&nbsp;</>,
    component: () => {
        const { isUserLoggedIn, decodedIdToken } = Greeting.useOidc();

        return (
            <span className="opacity-0 animate-[fadeIn_0.2s_ease-in_forwards]">
                {isUserLoggedIn ? `Welcome back ${decodedIdToken.name}` : `Hello anonymous visitor!`}
            </span>
        );
    }
});
