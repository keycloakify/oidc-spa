import { createFileRoute } from "@tanstack/react-router";
import { enforceLogin, createOidcComponent } from "@/oidc";
import { isKeycloak, createKeycloakUtils } from "oidc-spa/keycloak";

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
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm shadow-slate-950/40">
                <dl className="grid gap-2 text-sm text-slate-400">
                    <InfoRow label="name">{decodedIdToken.name}</InfoRow>
                    {decodedIdToken.email && <InfoRow label="Email">{decodedIdToken.email}</InfoRow>}
                    {decodedIdToken.preferred_username && (
                        <InfoRow label="Username">{decodedIdToken.preferred_username}</InfoRow>
                    )}
                </dl>

                {keycloakUtils && (
                    <>
                        {/* See: https://docs.oidc-spa.dev/features/user-account-management */}
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

                        {backFromAuthServer?.extraQueryParams.kc_action && (
                            <p className="mt-4 text-sm text-slate-400">
                                Result for {backFromAuthServer.extraQueryParams.kc_action}:{" "}
                                <span className="font-medium text-white">
                                    {backFromAuthServer.result.kc_action_status}
                                </span>
                            </p>
                        )}

                        <a
                            className="group inline-flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                            href={keycloakUtils.getAccountUrl({
                                clientId,
                                validRedirectUri
                            })}
                        >
                            My Account (Keycloak Account Console)
                            <svg
                                aria-hidden="true"
                                className="h-3 w-3 text-slate-400 transition-colors group-hover:text-slate-200"
                                viewBox="0 0 12 12"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    d="M4 2.5h5.5V8"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="1.5"
                                />
                                <path
                                    d="M2.5 9.5 9.5 2.5"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="1.5"
                                />
                            </svg>
                        </a>
                    </>
                )}
            </div>
        );
    }
});

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-slate-400">{label}</dt>
            <dd className="font-medium text-white">{children}</dd>
        </div>
    );
}
