import { oidcSpa, extractRequestAuthContext, type RuntimeConfigs } from "oidc-spa/server";
import { z } from "zod";

// App-specific user model exposed to the backend request handler.
// Shape it around what you need to identify and authorize the user.
export type User_server = {
    id: string;
    isAdmin: boolean;
};

// You define what you expect to be the shape of the access token claims.
type AccessTokenClaims = {
    sub: string;
    roles?: string[];
};

const AccessTokenClaims = z.toZod<AccessTokenClaims>()(
    z.object({ sub: z.string(), roles: z.array(z.string()).optional() })
);

const { validateAndGetAccessTokenClaims } = oidcSpa
    .withAccessTokenClaimsSchema(AccessTokenClaims)
    .withRuntimeConfigs(async (): Promise<RuntimeConfigs<AccessTokenClaims>> => {
        switch (process.env.VITE_OIDC_PROVIDER) {
            case "mock":
                return {
                    mode: "mock",
                    accessTokenClaims_mock: {
                        sub: "mock-user-id",
                        roles: ["admin"]
                    }
                };
            case "Keycloak":
                return {
                    mode: "real",
                    issuerUri: process.env.VITE_KEYCLOAK_ISSUER_URI!,
                    accessTokenValidation: {
                        method: "offline JWT validation",
                        expectedAudience: process.env["KEYCLOAK_EXPECTED_ACCESS_TOKEN_AUDIENCE"]!
                    }
                };
            case "Keycloak2":
                return {
                    mode: "real",
                    issuerUri: process.env.VITE_KEYCLOAK2_ISSUER_URI!,
                    accessTokenValidation: {
                        method: "introspection endpoint",
                        clientId: process.env["KEYCLOAK2_API_CLIENT_ID"]!,
                        clientSecret: process.env["KEYCLOAK2_API_CLIENT_SECRET"]!
                    }
                };
            case "Auth0":
                return {
                    mode: "real",
                    issuerUri: process.env.VITE_AUTH0_ISSUER_URI!,
                    accessTokenValidation: {
                        method: "offline JWT validation",
                        expectedAudience: process.env.VITE_AUTH0_API_IDENTIFIER!
                    }
                };
            case "EntraID":
                return {
                    mode: "real",
                    issuerUri: process.env.VITE_ENTRA_ISSUER_URI!,
                    accessTokenValidation: {
                        method: "offline JWT validation",
                        expectedAudience: process.env["ENTRA_API_CLIENT_ID"]!
                    }
                };
            default:
                throw new Error("Unknown provider");
        }
    })
    .createUtils();

export async function getUser(request: Request): Promise<User_server> {
    const requestAuthContext = extractRequestAuthContext({ request, trustProxy: true });

    if (!requestAuthContext) {
        throw new Response("Authentication required.", { status: 401 });
    }
    if (!requestAuthContext.isWellFormed) {
        throw new Response("Malformed authentication headers.", { status: 400 });
    }

    const result = await validateAndGetAccessTokenClaims(requestAuthContext.accessTokenAndMetadata);

    if (!result.isSuccess) {
        console.warn(result.debugErrorMessage);
        throw new Response("Could not authenticate request.", {
            status: result.recommendedHttpErrorStatusCode
        });
    }

    const user: User_server = {
        id: result.accessTokenClaims.sub,
        isAdmin: result.accessTokenClaims.roles?.includes("admin") ?? false
    };

    return user;
}
