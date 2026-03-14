import { createFileRoute } from "@tanstack/react-router";
import { oidcRequestMiddleware } from "@/oidc";

export const Route = createFileRoute("/demo/api/admin-data")({
    server: {
        middleware: [
            oidcRequestMiddleware({
                assert: "user logged in",
                hasRequiredClaims: ({ accessTokenClaims }) =>
                    accessTokenClaims.realm_access?.roles.includes("realm-admin")
            })
        ],
        handlers: {
            GET: async ({ context: { oidc } }) => {
                const userId = oidc.accessTokenClaims.sub;

                // Here you can perform information and retrieve data only admins
                // should have access to.

                const adminData = `<Sensible data only accessible to admin got from api request for user: ${userId}>`;

                return new Response(JSON.stringify(adminData), {
                    headers: {
                        "Content-Type": "application/json"
                    }
                });
            }
        }
    }
});
