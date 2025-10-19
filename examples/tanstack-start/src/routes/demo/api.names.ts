import { createFileRoute } from "@tanstack/react-router";
import { oidcRequestMiddleware } from "src/oidc";

export const Route = createFileRoute("/demo/api/names")({
    server: {
        middleware: [
            oidcRequestMiddleware({
                assert: "user logged in",
                hasRequiredClaims: async () => true
            })
        ],
        handlers: {
            GET: ({ context: { oidc } }) => {
                return new Response(
                    JSON.stringify(["Alice", "Bob", "Charlie", oidc.accessTokenClaims.sub]),
                    {
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }
                );
            }
        }
    }
});
