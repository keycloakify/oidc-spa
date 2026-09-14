import type { OidcSpaUtils } from "./types";
import type { ZodSchemaLike } from "../tools/ZodSchemaLike";
import { createOidcSpaUtils } from "./createOidcSpaUtils";
import type { AccessTokenClaims_specs } from "./types";

export type OidcSpaUtilsBuilder<
    AccessTokenClaims,
    ExcludedMethod extends "withExpectedAccessTokenClaimsShape" = never
> = Omit<
    {
        withExpectedAccessTokenClaimsShape: <AccessTokenClaims extends Record<string, unknown>>(
            accessTokenClaimsSchema: ZodSchemaLike<AccessTokenClaims_specs, AccessTokenClaims>
        ) => OidcSpaUtilsBuilder<
            AccessTokenClaims,
            ExcludedMethod | "withExpectedAccessTokenClaimsShape"
        >;
        createUtils: () => OidcSpaUtils<AccessTokenClaims>;
    },
    ExcludedMethod
>;

function createOidcSpaUtilsBuilder<AccessTokenClaims>(params: {
    accessTokenClaimsSchema: ZodSchemaLike<AccessTokenClaims_specs, AccessTokenClaims> | undefined;
}): OidcSpaUtilsBuilder<AccessTokenClaims> {
    return {
        withExpectedAccessTokenClaimsShape: accessTokenClaimsSchema =>
            createOidcSpaUtilsBuilder({ accessTokenClaimsSchema }),
        createUtils: () =>
            createOidcSpaUtils<AccessTokenClaims>({
                accessTokenClaimsSchema: params.accessTokenClaimsSchema
            })
    };
}

export const oidcSpaUtilsBuilder = createOidcSpaUtilsBuilder<AccessTokenClaims_specs>({
    accessTokenClaimsSchema: undefined
});
