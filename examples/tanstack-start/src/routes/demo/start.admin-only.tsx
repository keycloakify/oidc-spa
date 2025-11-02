import { createServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { enforceLogin, getOidc, oidcFnMiddleware, createOidcComponent, fetchWithAuth } from "@/oidc";
import Spinner from "@/components/Spinner";
import { ShieldCheck, ShieldAlert, ExternalLink } from "lucide-react";
import { isKeycloak, createKeycloakUtils } from "oidc-spa/keycloak";

const getAdminOnlyData = createServerFn({ method: "GET" })
    .middleware([
        oidcFnMiddleware({
            assert: "user logged in",
            hasRequiredClaims: ({ accessTokenClaims }) =>
                accessTokenClaims.realm_access?.roles.includes("realm-admin")
        })
    ])
    .handler(async ({ context: { oidc } }) => {
        const userId = oidc.accessTokenClaims.sub;

        // Here you can perform information and retrieve data only admins
        // should have access to.

        return `<Sensible data only accessible to admin got from server function for user: ${userId}>`;
    });

export const Route = createFileRoute("/demo/start/admin-only")({
    beforeLoad: enforceLogin,
    component: AdminOnly,
    loader: async () => {
        const oidc = await getOidc({ assert: "user logged in" });

        // NOTE: This is just cosmetic, it doesn't actually protect anything.
        // It's very important that you implement hasRequired claim in the server
        // function and request middleware to check that the user actually have the required
        // authorization.
        if (!oidc.getDecodedIdToken().realm_access?.roles.includes("realm-admin")) {
            throw new Error("unauthorized");
        }

        const adminData_fromServerFn = await getAdminOnlyData();

        const adminData_fromRestApi: string = await fetchWithAuth("/demo/api/admin-data").then(res =>
            res.json()
        );

        return { adminData_fromServerFn, adminData_fromRestApi };
    },
    errorComponent: ({ error }) => {
        if (!(error instanceof Error) || error.message !== "unauthorized") {
            throw error;
        }

        return (
            <div className="flex flex-1 items-center justify-center min-h-full p-4 text-white">
                <div className="w-full max-w-2xl p-8 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10 opacity-0 animate-[fadeIn_0.2s_ease-in_forwards]">
                    <div className="flex items-center gap-3 mb-4 text-red-300">
                        <ShieldAlert className="h-6 w-6" />
                        <h2 className="text-2xl font-semibold">Access denied</h2>
                    </div>
                    <p className="text-white/90">
                        You need the{" "}
                        <code className="px-2 py-0.5 rounded bg-white/10 border border-white/20">
                            realm-admin
                        </code>{" "}
                        role to view this page.
                    </p>
                </div>
            </div>
        );
    },
    pendingComponent: () => (
        <div className="flex flex-1 items-center justify-center py-16">
            <Spinner />
        </div>
    )
});

function AdminOnly() {
    const { adminData_fromServerFn, adminData_fromRestApi } = Route.useLoaderData();

    return (
        <div className="flex flex-1 items-center justify-center min-h-full p-4 text-white">
            <div className="w-full max-w-2xl p-8 rounded-xl backdrop-blur-md bg-black/50 shadow-xl border-8 border-black/10 opacity-0 animate-[fadeIn_0.2s_ease-in_forwards]">
                <header className="flex items-center gap-3 mb-4">
                    <ShieldCheck className="h-7 w-7 text-emerald-300" />
                    <h1 className="text-2xl font-semibold">Administration Page</h1>
                </header>
                <p className="mb-6 text-white/90">
                    Access granted. Your ID token includes the
                    <span className="mx-2 px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white">
                        realm-admin
                    </span>
                    role.
                </p>

                <div className="space-y-4">
                    <section className="p-4 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm shadow-md">
                        <h2 className="text-lg font-semibold mb-2">Server Function</h2>
                        <div className="rounded-md bg-black/40 border border-white/10 p-3 font-mono text-sm text-emerald-200">
                            {adminData_fromServerFn}
                        </div>
                    </section>

                    <section className="p-4 rounded-lg bg-white/10 border border-white/20 backdrop-blur-sm shadow-md">
                        <h2 className="text-lg font-semibold mb-2">REST API</h2>
                        <div className="rounded-md bg-black/40 border border-white/10 p-3 font-mono text-sm text-cyan-200">
                            {adminData_fromRestApi}
                        </div>
                    </section>
                </div>

                <div className="mt-6">
                    <KeycloakAdminConsoleLink />
                </div>
            </div>
        </div>
    );
}

const KeycloakAdminConsoleLink = createOidcComponent({
    component: () => {
        const { issuerUri } = KeycloakAdminConsoleLink.useOidc();

        if (!isKeycloak({ issuerUri })) {
            return null;
        }

        return (
            <div>
                <a
                    href={createKeycloakUtils({ issuerUri }).adminConsoleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold transition-colors shadow-lg shadow-cyan-500/30 border border-cyan-400/40"
                >
                    <ExternalLink className="h-4 w-4" />
                    Open the Keycloak administration console
                </a>
            </div>
        );
    }
});
