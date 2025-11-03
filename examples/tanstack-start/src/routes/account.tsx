import { createFileRoute } from "@tanstack/react-router";
import { enforceLogin, createOidcComponent } from "@/oidc";
import { isKeycloak, createKeycloakUtils } from "oidc-spa/keycloak";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/account")({
    beforeLoad: enforceLogin,
    component: () => <Account />
});

const Account = createOidcComponent({
    assert: "user logged in",
    component: () => {
        // Here we can safely assume that the user is logged in.
        const {
            decodedIdToken,
            goToAuthServer,
            backFromAuthServer,
            issuerUri,
            clientId,
            validRedirectUri
        } = Account.useOidc();

        // Since oidc-spa is a generic adapter, all Keycloak specific features are provided via a standalone
        // util. And since this example should run as well with other provider we first test if we are integrating
        // against a Keycloak server or not.
        const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

        return (
            <div className="flex flex-1 items-center justify-center min-h-full p-4 text-white">
                <div className="w-full max-w-2xl p-8 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10">
                    <h1 className="text-2xl font-semibold mb-4">Your Account</h1>

                    <dl className="space-y-2 text-white/90">
                        <InfoRow label="Name">{decodedIdToken.name}</InfoRow>
                        {decodedIdToken.email && <InfoRow label="Email">{decodedIdToken.email}</InfoRow>}
                        {decodedIdToken.preferred_username && (
                            <InfoRow label="Username">{decodedIdToken.preferred_username}</InfoRow>
                        )}
                    </dl>

                    {keycloakUtils && (
                        <>
                            {/* See: https://docs.oidc-spa.dev/features/user-account-management */}
                            <div className="mt-6 flex flex-wrap gap-2">
                                <button
                                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                                    onClick={() =>
                                        goToAuthServer({
                                            extraQueryParams: { kc_action: "UPDATE_PASSWORD" }
                                        })
                                    }
                                >
                                    Change password
                                </button>
                                <button
                                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                                    onClick={() =>
                                        goToAuthServer({
                                            extraQueryParams: { kc_action: "UPDATE_PROFILE" }
                                        })
                                    }
                                >
                                    Update profile
                                </button>
                                <button
                                    className="px-4 py-2 rounded-lg bg-rose-600/80 hover:bg-rose-600 transition-colors"
                                    onClick={() =>
                                        goToAuthServer({
                                            extraQueryParams: { kc_action: "delete_account" }
                                        })
                                    }
                                >
                                    Delete account
                                </button>
                            </div>

                            {backFromAuthServer?.extraQueryParams.kc_action && (
                                <p className="mt-4 text-sm text-white/80">
                                    Result for {backFromAuthServer.extraQueryParams.kc_action}:{" "}
                                    <span className="font-semibold text-white">
                                        {backFromAuthServer.result.kc_action_status}
                                    </span>
                                </p>
                            )}

                            <div className="mt-6">
                                <a
                                    href={keycloakUtils.getAccountUrl({ clientId, validRedirectUri })}
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold transition-colors shadow-lg shadow-cyan-500/30 border border-cyan-400/40"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    Open Keycloak account console
                                </a>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }
});

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-2 border border-white/10 bg-white/5 rounded-lg px-3 py-2">
            <dt className="text-white/70">{label}</dt>
            <dd className="font-medium text-white">{children}</dd>
        </div>
    );
}
