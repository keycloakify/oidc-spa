import { createFileRoute } from "@tanstack/react-router";
import { enforceLogin, getOidc, useOidc } from "~/oidc";
import { isKeycloak, createKeycloakUtils } from "oidc-spa/keycloak";

export const Route = createFileRoute("/admin-only")({
    beforeLoad: enforceLogin,
    loader: async () => {
        const oidc = await getOidc({ assert: "user logged in" });

        if (!oidc.getDecodedIdToken().realm_access?.roles.includes("realm-admin")) {
            throw new Error("unauthorized");
        }
    },
    head: () => ({ meta: [{ title: "Admin" }] }),
    component: AdminOnly,
    errorComponent: ({ error }) => {
        if (!(error instanceof Error) || error.message !== "unauthorized") {
            throw error;
        }
        return (
            <section className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-100">
                <p>
                    You need the <code>realm-admin</code> role to view this page.
                </p>
            </section>
        );
    }
});

function AdminOnly() {
    const { issuerUri } = useOidc({ assert: "user logged in" });

    const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

    return (
        <section className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-xl font-semibold text-white">Administration Page</h1>
                <p className="text-sm text-slate-300">
                    Access is granted because your ID token includes the <code>realm-admin</code> role.
                </p>
            </div>

            {keycloakUtils !== undefined && (
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
                    <a
                        className="inline-flex items-center text-slate-200 underline underline-offset-4 decoration-slate-700 transition-colors hover:decoration-slate-400"
                        href={keycloakUtils.adminConsoleUrl}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Open the Keycloak administration console
                    </a>
                </div>
            )}
        </section>
    );
}
