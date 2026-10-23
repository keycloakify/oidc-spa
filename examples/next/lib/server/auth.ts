import "server-only";
import { TRPCError } from "@trpc/server";
import { oidcSpa, extractRequestAuthContext } from "oidc-spa/server";
import { z } from "zod";
import type { User_server } from "../oidc";

const { validateAndGetAccessTokenClaims } = oidcSpa
    .withAccessTokenClaimsSchema(
        z.object({
            sub: z.string(),
            roles: z.array(z.string()).optional()
        })
    )
    .withRuntimeConfigs(async () => {
        switch (process.env.NEXT_PUBLIC_OIDC_PROVIDER) {
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
                    issuerUri: process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER_URI!,
                    accessTokenValidation: {
                        method: "offline JWT validation",
                        expectedAudience: process.env["KEYCLOAK_EXPECTED_ACCESS_TOKEN_AUDIENCE"]!
                    }
                };
                break;
            case "Keycloak2":
                return {
                    mode: "real",
                    issuerUri: process.env.NEXT_PUBLIC_KEYCLOAK2_ISSUER_URI!,
                    accessTokenValidation: {
                        method: "introspection endpoint",
                        clientId: process.env["KEYCLOAK2_API_CLIENT_ID"]!,
                        clientSecret: process.env["KEYCLOAK2_API_CLIENT_SECRET"]!
                    }
                };
            case "Auth0":
                return {
                    mode: "real",
                    issuerUri: process.env.NEXT_PUBLIC_AUTH0_ISSUER_URI!,
                    accessTokenValidation: {
                        method: "offline JWT validation",
                        expectedAudience: process.env.NEXT_PUBLIC_AUTH0_API_IDENTIFIER!
                    }
                };
            case "EntraID":
                return {
                    mode: "real",
                    issuerUri: process.env.NEXT_PUBLIC_ENTRA_ISSUER_URI!,
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

export async function getUser(params: { req: Request }): Promise<User_server> {
    const { req } = params;

    const requestAuthContext = extractRequestAuthContext({ request: req, trustProxy: true });

    if (!requestAuthContext) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    if (!requestAuthContext.isWellFormed) {
        throw new TRPCError({ code: "BAD_REQUEST" });
    }

    const result = await validateAndGetAccessTokenClaims(requestAuthContext.accessTokenAndMetadata);

    if (!result.isSuccess) {
        console.warn(result.debugErrorMessage);
        throw new TRPCError({
            code: "UNAUTHORIZED"
        });
    }

    const user: User_server = {
        id: result.accessTokenClaims.sub,
        isAdmin: result.accessTokenClaims.roles?.includes("admin") ?? false
    };

    return user;
}
