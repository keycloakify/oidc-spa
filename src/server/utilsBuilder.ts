import type { OidcSpaUtils } from "./types";
import type { ZodSchemaLike } from "../tools/ZodSchemaLike";
import { createOidcSpaUtils } from "./createOidcSpaUtils";
import type { DecodedAccessToken_RFC9068 } from "./types";

export type OidcSpaUtilsBuilder<
    DecodedAccessToken extends Record<string, unknown> = DecodedAccessToken_RFC9068,
    ExcludedMethod extends "withExpectedDecodedAccessTokenShape" | "createUtils" = never
> = Omit<
    {
        withExpectedDecodedAccessTokenShape: <
            DecodedAccessToken extends Record<string, unknown>
        >(params: {
            decodedAccessTokenSchema: ZodSchemaLike<DecodedAccessToken_RFC9068, DecodedAccessToken>;
        }) => OidcSpaUtilsBuilder<
            DecodedAccessToken,
            ExcludedMethod | "withExpectedDecodedAccessTokenShape"
        >;
        createUtils: () => OidcSpaUtils<DecodedAccessToken>;
    },
    ExcludedMethod
>;

function createOidcSpaUtilsBuilder<
    DecodedAccessToken extends Record<string, unknown> = DecodedAccessToken_RFC9068
>(params: {
    decodedAccessTokenSchema: ZodSchemaLike<DecodedAccessToken_RFC9068, DecodedAccessToken> | undefined;
}): OidcSpaUtilsBuilder<DecodedAccessToken> {
    return {
        withExpectedDecodedAccessTokenShape: ({ decodedAccessTokenSchema }) =>
            createOidcSpaUtilsBuilder({ decodedAccessTokenSchema }),
        createUtils: () =>
            createOidcSpaUtils<DecodedAccessToken>({
                decodedAccessTokenSchema: params.decodedAccessTokenSchema
            })
    };
}

export const oidcSpaUtilsBuilder = createOidcSpaUtilsBuilder({
    decodedAccessTokenSchema: undefined
});
