import "server-only";
import { TRPCError } from "@trpc/server";
import { oidcSpa, extractRequestAuthContext } from "oidc-spa/server";
import { z } from "zod";

const { bootstrapAuth, validateAndDecodeAccessToken } = oidcSpa
    .withExpectedDecodedAccessTokenShape({
        decodedAccessTokenSchema: z.object({
            sub: z.string(),
            resource_access: z
                .object({
                    "realm-management": z.object({ roles: z.array(z.string()) }).optional()
                })
                .optional()
        })
    })
    .createUtils();

bootstrapAuth(
    process.env.NEXT_PUBLIC_OIDC_USE_MOCK === "true"
        ? {
              implementation: "mock",
              behavior: "use static identity",
              decodedAccessToken_mock: {
                  sub: "mock-user-id",
                  resource_access: { "realm-management": { roles: ["realm-admin"] } }
              }
          }
        : {
              implementation: "real",
              issuerUri: process.env.NEXT_PUBLIC_OIDC_ISSUER_URI!,
              expectedAudience: process.env.NEXT_PUBLIC_OIDC_ACCESS_TOKEN_EXPECTED_AUDIENCE!
          }
);

export type User = {
    id: string;
    isKeycloakAdmin: boolean;
};

export async function getUser({ req }: { req: Request }): Promise<User> {
    const requestAuthContext = extractRequestAuthContext({ request: req, trustProxy: true });

    if (!requestAuthContext) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    if (!requestAuthContext.isWellFormed) {
        throw new TRPCError({ code: "BAD_REQUEST" });
    }

    const result = await validateAndDecodeAccessToken(requestAuthContext.accessTokenAndMetadata);

    if (!result.isSuccess) {
        console.warn(result.debugErrorMessage);
        throw new TRPCError({
            code: "UNAUTHORIZED"
        });
    }

    const user: User = {
        id: result.decodedAccessToken.sub,
        isKeycloakAdmin:
            result.decodedAccessToken.resource_access?.["realm-management"]?.roles.includes(
                "realm-admin"
            ) ?? false
    };

    return user;
}
