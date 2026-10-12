import type { OidcSpaUtils } from "./types";
import type { ZodSchemaLike } from "../tools/ZodSchemaLike";
import { createUtils } from "./createUtils";
import type { AccessTokenClaims_specs } from "./types";

export type OidcSpa<
    AccessTokenClaims,
    ExcludedMethod extends "withAccessTokenClaimsSchema" = never
> = Omit<
    {
        withAccessTokenClaimsSchema: <AccessTokenClaims extends Record<string, unknown>>(
            accessTokenClaimsSchema: ZodSchemaLike<AccessTokenClaims_specs, AccessTokenClaims>
        ) => OidcSpa<AccessTokenClaims, ExcludedMethod | "withAccessTokenClaimsSchema">;
        createUtils: () => OidcSpaUtils<AccessTokenClaims>;
    },
    ExcludedMethod
>;

function createOidcSpa<AccessTokenClaims>(params: {
    accessTokenClaimsSchema: ZodSchemaLike<AccessTokenClaims_specs, AccessTokenClaims> | undefined;
}): OidcSpa<AccessTokenClaims> {
    return {
        withAccessTokenClaimsSchema: accessTokenClaimsSchema =>
            createOidcSpa({ accessTokenClaimsSchema }),
        createUtils: () =>
            createUtils<AccessTokenClaims>({
                accessTokenClaimsSchema: params.accessTokenClaimsSchema
            })
    };
}

export const oidcSpa = createOidcSpa<AccessTokenClaims_specs>({
    accessTokenClaimsSchema: undefined
});
