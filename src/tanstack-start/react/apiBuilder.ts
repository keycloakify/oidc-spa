import type { OidcSpaApi, CreateValidateAndGetAccessTokenClaims, ParamsOfBootstrap } from "./types";
import type { Oidc as Oidc_core } from "../../core";
import { assert, type Equals } from "../../tools/tsafe/assert";
import type { ZodSchemaLike } from "../../tools/ZodSchemaLike";
import type { DecodedAccessToken_RFC9068 as AccessTokenClaims_RFC9068 } from "../../backend";
import { createCreateValidateAndGetAccessTokenClaims_rfc9068 } from "./accessTokenValidation_rfc9068";
import { createOidcSpaApi } from "./createOidcSpaApi";

export type OidcSpaApiBuilder<
    AutoLogin extends boolean = false,
    DecodedIdToken extends Record<string, unknown> = Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
    AccessTokenClaims extends Record<string, unknown> | undefined = undefined,
    ExcludedMethod extends
        | "withAutoLogin"
        | "withExpectedDecodedIdTokenShape"
        | "withAccessTokenValidation"
        | "createApi" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpaApiBuilder<
            true,
            DecodedIdToken,
            AccessTokenClaims,
            ExcludedMethod | "withAutoLogin"
        >;
        withExpectedDecodedIdTokenShape: <DecodedIdToken extends Record<string, unknown>>(params: {
            decodedIdTokenSchema: ZodSchemaLike<
                Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
                DecodedIdToken
            >;
            decodedIdToken_mock?: NoInfer<DecodedIdToken>;
        }) => OidcSpaApiBuilder<
            AutoLogin,
            DecodedIdToken,
            AccessTokenClaims,
            ExcludedMethod | "withExpectedDecodedIdTokenShape"
        >;
        withAccessTokenValidation: {
            <AccessTokenClaims extends Record<string, unknown> = AccessTokenClaims_RFC9068>(params: {
                type: "RFC 9068: JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens";
                accessTokenClaimsSchema?: ZodSchemaLike<AccessTokenClaims_RFC9068, AccessTokenClaims>;
                accessTokenClaims_mock?: NoInfer<AccessTokenClaims>;

                expectedAudience?: (params: {
                    paramsOfBootstrap: ParamsOfBootstrap.Real<boolean>;
                    process: { env: Record<string, string> };
                }) => string;
            }): OidcSpaApiBuilder<
                AutoLogin,
                DecodedIdToken,
                AccessTokenClaims,
                ExcludedMethod | "withAccessTokenValidation"
            >;
            <AccessTokenClaims extends Record<string, unknown>>(params: {
                type: "custom";
                createValidateAndGetAccessTokenClaims: CreateValidateAndGetAccessTokenClaims<AccessTokenClaims>;
            }): OidcSpaApiBuilder<
                AutoLogin,
                DecodedIdToken,
                AccessTokenClaims,
                ExcludedMethod | "withAccessTokenValidation"
            >;
        };
        createApi: () => OidcSpaApi<AutoLogin, DecodedIdToken, AccessTokenClaims>;
    },
    ExcludedMethod
>;

function createOidcSpaApiBuilder<
    AutoLogin extends boolean = false,
    DecodedIdToken extends Record<string, unknown> = Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
    AccessTokenClaims extends Record<string, unknown> | undefined = undefined
>(params: {
    autoLogin: AutoLogin;
    decodedIdTokenSchema:
        | ZodSchemaLike<Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec, DecodedIdToken>
        | undefined;
    decodedIdToken_mock: DecodedIdToken | undefined;
    createValidateAndGetAccessTokenClaims:
        | CreateValidateAndGetAccessTokenClaims<AccessTokenClaims>
        | undefined;
}): OidcSpaApiBuilder<AutoLogin, DecodedIdToken, AccessTokenClaims> {
    return {
        withAutoLogin: () =>
            createOidcSpaApiBuilder({
                autoLogin: true,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock,
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims
            }),
        withExpectedDecodedIdTokenShape: ({ decodedIdTokenSchema, decodedIdToken_mock }) =>
            createOidcSpaApiBuilder({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema,
                decodedIdToken_mock: decodedIdToken_mock,
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims
            }),
        withAccessTokenValidation: params_scope =>
            createOidcSpaApiBuilder({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock,
                createValidateAndGetAccessTokenClaims: ((): any => {
                    switch (params_scope.type) {
                        case "RFC 9068: JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens": {
                            const { accessTokenClaimsSchema, accessTokenClaims_mock, expectedAudience } =
                                params_scope;

                            const { createValidateAndGetAccessTokenClaims } =
                                createCreateValidateAndGetAccessTokenClaims_rfc9068<
                                    Exclude<AccessTokenClaims, undefined>
                                >({
                                    // @ts-expect-error
                                    accessTokenClaims_mock,
                                    // @ts-expect-error
                                    accessTokenClaimsSchema,
                                    expectedAudience
                                });
                            return createValidateAndGetAccessTokenClaims;
                        }
                        case "custom": {
                            const { createValidateAndGetAccessTokenClaims } = params_scope;
                            return createValidateAndGetAccessTokenClaims;
                        }
                        default:
                            assert<Equals<typeof params_scope, never>>(false);
                    }
                })()
            }),
        createApi: () =>
            createOidcSpaApi<AutoLogin, DecodedIdToken, AccessTokenClaims>({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock,
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims
            })
    };
}

export const oidcSpaApiBuilder = createOidcSpaApiBuilder({
    autoLogin: false,
    createValidateAndGetAccessTokenClaims: undefined,
    decodedIdToken_mock: undefined,
    decodedIdTokenSchema: undefined
});
