import { createFileRoute } from "@tanstack/react-router";
import { getOidcRequestMiddleware } from "src/oidc";

export const Route = createFileRoute("/demo/api/names")({
    server: {
        middleware: [
            getOidcRequestMiddleware({
                assert: "user logged in",
                hasRequiredClaims: async () => true
            })
        ],
        handlers: {
            GET: ({ context: { oidcContext } }) => {
                return new Response(
                    JSON.stringify(["Alice", "Bob", "Charlie", oidcContext.accessTokenClaims.sub]),
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
