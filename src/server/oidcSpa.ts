import type { OidcSpaUtils, RuntimeConfigs } from "./types";
import type { ZodSchemaLike } from "../tools/ZodSchemaLike";
import { createUtils } from "./createUtils";
import type { AccessTokenClaims_specs } from "./types";
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";
import { assert } from "../tools/tsafe/assert";

export type OidcSpa<
    AccessTokenClaims,
    ExcludedMethod extends "withAccessTokenClaimsSchema" | "withRuntimeConfigs" = never
> = Omit<
    {
        withAccessTokenClaimsSchema: <AccessTokenClaims extends Record<string, unknown>>(
            accessTokenClaimsSchema: ZodSchemaLike<AccessTokenClaims_specs, AccessTokenClaims>
        ) => OidcSpa<AccessTokenClaims, ExcludedMethod | "withAccessTokenClaimsSchema">;
        /**
         * Supply configs directly or resolve them lazily on the first validation.
         * Successful configs are reused. A throwing getter yields a suggested 503
         * for the request and can be retried by a subsequent request.
         */
        withRuntimeConfigs: (
            getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<
                void,
                RuntimeConfigs<AccessTokenClaims>
            >
        ) => OidcSpa<
            AccessTokenClaims,
            ExcludedMethod | "withRuntimeConfigs" | "withAccessTokenClaimsSchema"
        >;
    },
    ExcludedMethod
> &
    ("withRuntimeConfigs" extends ExcludedMethod
        ? { createUtils: () => OidcSpaUtils<AccessTokenClaims> }
        : {});

function createOidcSpa<AccessTokenClaims>(params: {
    accessTokenClaimsSchema: ZodSchemaLike<AccessTokenClaims_specs, AccessTokenClaims> | undefined;
    getRuntimeConfigsOrRuntimeConfigs:
        | OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs<AccessTokenClaims>>
        | undefined;
}): OidcSpa<AccessTokenClaims> {
    return {
        withAccessTokenClaimsSchema: accessTokenClaimsSchema =>
            createOidcSpa({ accessTokenClaimsSchema, getRuntimeConfigsOrRuntimeConfigs: undefined }),
        // @ts-expect-error
        withRuntimeConfigs: (
            getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<
                void,
                RuntimeConfigs<AccessTokenClaims>
            >
        ) => createOidcSpa({ ...params, getRuntimeConfigsOrRuntimeConfigs }),
        createUtils: () => {
            assert(params.getRuntimeConfigsOrRuntimeConfigs !== undefined);
            return createUtils<AccessTokenClaims>({
                accessTokenClaimsSchema: params.accessTokenClaimsSchema,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            });
        }
    };
}

export const oidcSpa = createOidcSpa<AccessTokenClaims_specs>({
    accessTokenClaimsSchema: undefined,
    getRuntimeConfigsOrRuntimeConfigs: undefined
});
