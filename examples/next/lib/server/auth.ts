import "server-only";
import { TRPCError } from "@trpc/server";
import { oidcSpa, extractRequestAuthContext } from "oidc-spa/server";
import { z } from "zod";

const { bootstrapAuth, validateAndDecodeAccessToken } = oidcSpa
    .withExpectedDecodedAccessTokenShape({
        decodedAccessTokenSchema: z.object({ sub: z.string().min(1) })
    })
    .createUtils();

export { bootstrapAuth };

export type User = {
    id: string;
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

    const user: User = { id: result.decodedAccessToken.sub };

    return user;
}
