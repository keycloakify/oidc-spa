import { createFileRoute } from "@tanstack/react-router";
import { oidcRequestMiddleware } from "#/oidc";

export const Route = createFileRoute("/demo/api/admin-data")({
    server: {
        middleware: [
            oidcRequestMiddleware({
                require: "authed request",
                hasAuthorization: ({ user }) => user.isKeycloakAdmin
            })
        ],
        handlers: {
            GET: async ({ context: { oidc } }) => {
                const { user } = oidc;

                // Here you can perform information and retrieve data only admins
                // should have access to.

                const adminData = `<Sensible data only accessible to admin got from api request for user: ${user.id}>`;

                return new Response(JSON.stringify(adminData), {
                    headers: {
                        "Content-Type": "application/json"
                    }
                });
            }
        }
    }
});
