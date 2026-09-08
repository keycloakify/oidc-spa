import type {
    OidcSpaUtils,
    CreateValidateAndGetAccessTokenClaims,
    ParamsOfBootstrap,
    CreateUser
} from "./types";
import type { DecodedAccessToken_RFC9068 as AccessTokenClaims_RFC9068 } from "../../server";
import type { Oidc as Oidc_core } from "../../core";
import { assert, type Equals } from "../../tools/tsafe/assert";
import type { ZodSchemaLike } from "../../tools/ZodSchemaLike";
import { createCreateValidateAndGetAccessTokenClaims_rfc9068 } from "./accessTokenValidation_rfc9068";
import { createOidcSpaUtils } from "./createOidcSpaUtils";

export type OidcSpaUtilsBuilder<
    AutoLogin extends boolean = false,
    DecodedIdToken extends Record<string, unknown> = Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
    User = never,
    AccessTokenClaims extends Record<string, unknown> | undefined = undefined,
    ExcludedMethod extends
        | "withAutoLogin"
        | "withExpectedDecodedIdTokenShape"
        | "withUser"
        | "withAccessTokenValidation"
        | "createUtils" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpaUtilsBuilder<
            true,
            DecodedIdToken,
            User,
            AccessTokenClaims,
            ExcludedMethod | "withAutoLogin"
        >;
        withExpectedDecodedIdTokenShape: <DecodedIdToken extends Record<string, unknown>>(params: {
            decodedIdTokenSchema: ZodSchemaLike<
                Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
                DecodedIdToken
            >;
            decodedIdToken_mock?: NoInfer<DecodedIdToken>;
        }) => OidcSpaUtilsBuilder<
            AutoLogin,
            DecodedIdToken,
            User,
            AccessTokenClaims,
            ExcludedMethod | "withExpectedDecodedIdTokenShape"
        >;
        withUser: <User>(params: {
            createUser: CreateUser<User>;
            user_mock?: NoInfer<User>;
        }) => OidcSpaUtilsBuilder<
            AutoLogin,
            DecodedIdToken,
            User,
            AccessTokenClaims,
            ExcludedMethod | "withUser"
        >;
        withAccessTokenValidation: {
            <AccessTokenClaims extends Record<string, unknown> = AccessTokenClaims_RFC9068>(params: {
                type: "RFC 9068: JSON Web Token (JWT) Profile for OAuth 2.0 Access Tokens";
                accessTokenClaimsSchema?: ZodSchemaLike<AccessTokenClaims_RFC9068, AccessTokenClaims>;
                accessTokenClaims_mock?: NoInfer<AccessTokenClaims>;

                expectedAudience?: (params: {
                    paramsOfBootstrap: ParamsOfBootstrap.Real;
                    process: { env: Record<string, string> };
                }) => string;
            }): OidcSpaUtilsBuilder<
                AutoLogin,
                DecodedIdToken,
                User,
                AccessTokenClaims,
                ExcludedMethod | "withAccessTokenValidation"
            >;
            <AccessTokenClaims extends Record<string, unknown>>(params: {
                type: "custom";
                createValidateAndGetAccessTokenClaims: CreateValidateAndGetAccessTokenClaims<AccessTokenClaims>;
            }): OidcSpaUtilsBuilder<
                AutoLogin,
                DecodedIdToken,
                User,
                AccessTokenClaims,
                ExcludedMethod | "withAccessTokenValidation"
            >;
        };
        createUtils: () => OidcSpaUtils<AutoLogin, DecodedIdToken, User, AccessTokenClaims>;
    },
    ExcludedMethod
>;

function createOidcSpaUtilsBuilder<
    AutoLogin extends boolean = false,
    DecodedIdToken extends Record<string, unknown> = Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
    User = never,
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
    createUser: CreateUser<User> | undefined;
    user_mock: User | undefined;
}): OidcSpaUtilsBuilder<AutoLogin, DecodedIdToken, User, AccessTokenClaims> {
    return {
        withAutoLogin: () =>
            createOidcSpaUtilsBuilder({
                autoLogin: true,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock,
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims,
                createUser: params.createUser,
                user_mock: params.user_mock
            }),
        withExpectedDecodedIdTokenShape: ({ decodedIdTokenSchema, decodedIdToken_mock }) =>
            createOidcSpaUtilsBuilder({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema,
                decodedIdToken_mock: decodedIdToken_mock,
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims,
                createUser: params.createUser,
                user_mock: params.user_mock
            }),
        withUser: ({ createUser, user_mock }) =>
            createOidcSpaUtilsBuilder({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock,
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims,
                createUser,
                user_mock
            }),
        withAccessTokenValidation: params_scope =>
            createOidcSpaUtilsBuilder({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock,
                createUser: params.createUser,
                user_mock: params.user_mock,
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
        createUtils: () =>
            createOidcSpaUtils<AutoLogin, DecodedIdToken, User, AccessTokenClaims>({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock,
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims,
                createUser: params.createUser,
                user_mock: params.user_mock
            })
    };
}

export const oidcSpaUtilsBuilder = createOidcSpaUtilsBuilder({
    autoLogin: false,
    createValidateAndGetAccessTokenClaims: undefined,
    createUser: undefined,
    user_mock: undefined,
    decodedIdToken_mock: undefined,
    decodedIdTokenSchema: undefined
});
