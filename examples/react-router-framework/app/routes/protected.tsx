import type { ReactNode } from "react";
import { useLoaderData } from "react-router";
import { useOidc, enforceLogin, fetchWithAuth } from "~/oidc";
import { isKeycloak, createKeycloakUtils } from "oidc-spa/keycloak";
import type { Route } from "./+types/protected";

export async function clientLoader(params: Route.ClientLoaderArgs) {
    await enforceLogin(params);

    const demoPosts: {
        id: number;
        title: string;
        body: string;
    }[] = await fetchWithAuth("https://jsonplaceholder.typicode.com/posts?_limit=4").then(r => r.json());

    return { demoPosts };
}

export default function Protected() {
    // Here we can safely assume that the user is logged in.
    const { decodedIdToken, goToAuthServer, backFromAuthServer, issuerUri } = useOidc({
        assert: "user logged in"
    });

    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    const { demoPosts } = useLoaderData<typeof clientLoader>();

    return (
        <section className="space-y-6">
            <div className="space-y-1">
                <p className="text-sm uppercase tracking-wide text-slate-400">Protected content</p>
                <h1 className="text-2xl font-semibold text-white">Hello {decodedIdToken.name}</h1>
                <p className="text-base text-slate-300">
                    These actions come directly from your identity provider via oidc-spa.
                </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm shadow-slate-950/40">
                <dl className="grid gap-2 text-sm text-slate-400">
                    <InfoRow label="Subject">{decodedIdToken.sub}</InfoRow>
                    {decodedIdToken.email && <InfoRow label="Email">{decodedIdToken.email}</InfoRow>}
                    {decodedIdToken.preferred_username && (
                        <InfoRow label="Username">{decodedIdToken.preferred_username}</InfoRow>
                    )}
                </dl>

                {keycloakUtils !== undefined && (
                    <div className="mt-6 flex flex-wrap gap-3">
                        <button
                            className="inline-flex items-center rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500"
                            onClick={() =>
                                goToAuthServer({
                                    extraQueryParams: { kc_action: "UPDATE_PASSWORD" }
                                })
                            }
                        >
                            Change password
                        </button>
                        <button
                            className="inline-flex items-center rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500"
                            onClick={() =>
                                goToAuthServer({
                                    extraQueryParams: { kc_action: "UPDATE_PROFILE" }
                                })
                            }
                        >
                            Update profile
                        </button>
                        <button
                            className="inline-flex items-center rounded-full border border-rose-400/60 px-4 py-2 text-sm font-semibold text-rose-200 transition-colors hover:border-rose-300 hover:text-rose-100"
                            onClick={() =>
                                goToAuthServer({
                                    extraQueryParams: { kc_action: "delete_account" }
                                })
                            }
                        >
                            Delete account
                        </button>
                    </div>
                )}

                {backFromAuthServer?.extraQueryParams.kc_action && (
                    <p className="mt-4 text-sm text-slate-400">
                        Result for {backFromAuthServer.extraQueryParams.kc_action}:{" "}
                        <span className="font-medium text-white">
                            {backFromAuthServer.result.kc_action_status}
                        </span>
                    </p>
                )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm shadow-slate-950/40">
                <div className="space-y-2 text-sm text-slate-300">
                    <p>
                        The list below was fetched during the client loader with{" "}
                        <code className="font-mono text-xs text-slate-200">fetchWithAuth</code>, which
                        automatically injects{" "}
                        <code className="font-mono text-xs text-slate-200">
                            Authorization: Bearer &lt;access_token&gt;
                        </code>{" "}
                        headers into every request.
                    </p>
                    <p className="text-slate-400">
                        JSONPlaceholder is a public API—we treat it as a stand-in for a protected
                        resource server.
                    </p>
                </div>
                <ul className="mt-4 space-y-3">
                    {demoPosts.map(post => (
                        <li
                            key={post.id}
                            className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 shadow-inner shadow-black/20"
                        >
                            <p className="text-sm font-semibold text-white">{post.title}</p>
                            <p className="mt-1 text-sm text-slate-400">{post.body}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-slate-400">{label}</dt>
            <dd className="font-medium text-white">{children}</dd>
        </div>
    );
}

export function meta({}: Route.MetaArgs) {
    return [{ title: "Protected" }];
}
