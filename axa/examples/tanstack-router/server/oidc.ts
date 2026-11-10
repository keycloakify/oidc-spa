import type { Request } from "express";
import { extractRequestAuthContext, oidcSpa, type RuntimeConfigs } from "oidc-spa/server";
import { z } from "zod";

// App level representation of a user for the API request handler.
// Shape it to be able to identify the user and it's authorizations.
export type User_server = { id: string; isAdmin: boolean };

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
        return {
            mode: "real",
            issuerUri: process.env.VITE_KEYCLOAK_ISSUER_URI!,
            accessTokenValidation: {
                method: "offline JWT validation",
                expectedAudience: process.env.KEYCLOAK_EXPECTED_ACCESS_TOKEN_AUDIENCE!
            }
        };
    })
    .createUtils();

export class HttpError extends Error {
    constructor(readonly status: 400 | 401 | 403 | 404 | 500 | 503, message: string) {
        super(message);
    }
}

export async function getUser(req: Request): Promise<User_server> {
    const context = extractRequestAuthContext({ request: req, trustProxy: true });

    if (context === undefined) throw new HttpError(401, "Authentication required.");
    if (!context.isWellFormed) throw new HttpError(400, "Malformed authentication headers.");

    const result = await validateAndGetAccessTokenClaims(context.accessTokenAndMetadata);

    if (!result.isSuccess) {
        console.warn(result.debugErrorMessage);
        throw new HttpError(result.recommendedHttpErrorStatusCode, "Could not authenticate request.");
    }

    return {
        id: result.accessTokenClaims.sub,
        isAdmin: result.accessTokenClaims.roles?.includes("admin") ?? false
    };
}
