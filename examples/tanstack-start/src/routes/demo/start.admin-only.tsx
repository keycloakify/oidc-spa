import { createServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { enforceLogin, getOidc, oidcFnMiddleware, createOidcComponent, fetchWithAuth } from "@/oidc";
import Spinner from "@/components/Spinner";
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

        const adminData_fromRestApi: string = await fetchWithAuth("/demo/api/admin-data", {
            method: "POST"
        }).then(res => res.json());

        return { adminData_fromServerFn, adminData_fromRestApi };
    },
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
        <section className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-xl font-semibold text-white">Administration Page</h1>
                <p className="text-sm text-slate-300">
                    Access is granted because your ID token includes the <code>realm-admin</code> role.
                </p>
            </div>

            <div>
                Data that only admins can access retrieved via server function {adminData_fromServerFn}
            </div>
            <div>
                Data that only admins can access retrieved via REST API function {adminData_fromRestApi}
            </div>

            <KeycloakAdminConsoleLink />
        </section>
    );
}

const KeycloakAdminConsoleLink = createOidcComponent({
    component: () => {
        const { issuerUri } = KeycloakAdminConsoleLink.useOidc();

        const keycloakUtils = isKeycloak({ issuerUri }) ? createKeycloakUtils({ issuerUri }) : undefined;

        if (keycloakUtils === undefined) {
            return null;
        }

        return (
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
        );
    }
});
