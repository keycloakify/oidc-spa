import type {
    OidcSpaUtils,
    CreateValidateAndGetAccessTokenClaims,
    ParamsOfBootstrap,
    CreateUser
} from "./types";
import type { DecodedAccessToken_RFC9068 as AccessTokenClaims_RFC9068 } from "../../server";
import { assert, type Equals } from "../../tools/tsafe/assert";
import type { ZodSchemaLike } from "../../tools/ZodSchemaLike";
import { createCreateValidateAndGetAccessTokenClaims_rfc9068 } from "./accessTokenValidation_rfc9068";
import { createOidcSpaUtils } from "./createOidcSpaUtils";

export type OidcSpaUtilsBuilder<
    User = never,
    AutoLogin extends boolean = false,
    AccessTokenClaims extends Record<string, unknown> | undefined = undefined,
    ExcludedMethod extends
        | "withAutoLogin"
        | "withUser"
        | "withAccessTokenValidation"
        | "createUtils" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpaUtilsBuilder<
            User,
            true,
            AccessTokenClaims,
            ExcludedMethod | "withAutoLogin"
        >;
        withUser: <User>(params: {
            createUser: CreateUser<User>;
            user_mock?: NoInfer<User>;
        }) => OidcSpaUtilsBuilder<User, AutoLogin, AccessTokenClaims, ExcludedMethod | "withUser">;
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
                User,
                AutoLogin,
                AccessTokenClaims,
                ExcludedMethod | "withAccessTokenValidation"
            >;
            <AccessTokenClaims extends Record<string, unknown>>(params: {
                type: "custom";
                createValidateAndGetAccessTokenClaims: CreateValidateAndGetAccessTokenClaims<AccessTokenClaims>;
            }): OidcSpaUtilsBuilder<
                User,
                AutoLogin,
                AccessTokenClaims,
                ExcludedMethod | "withAccessTokenValidation"
            >;
        };
        createUtils: () => OidcSpaUtils<User, AutoLogin, AccessTokenClaims>;
    },
    ExcludedMethod
>;

function createOidcSpaUtilsBuilder<
    User = never,
    AutoLogin extends boolean = false,
    AccessTokenClaims extends Record<string, unknown> | undefined = undefined
>(params: {
    autoLogin: AutoLogin;
    createValidateAndGetAccessTokenClaims:
        | CreateValidateAndGetAccessTokenClaims<AccessTokenClaims>
        | undefined;
    createUser: CreateUser<User> | undefined;
    user_mock: User | undefined;
}): OidcSpaUtilsBuilder<User, AutoLogin, AccessTokenClaims> {
    return {
        withAutoLogin: () =>
            createOidcSpaUtilsBuilder({
                autoLogin: true,
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims,
                createUser: params.createUser,
                user_mock: params.user_mock
            }),
        withUser: ({ createUser, user_mock }) =>
            createOidcSpaUtilsBuilder({
                autoLogin: params.autoLogin,
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims,
                createUser,
                user_mock
            }),
        withAccessTokenValidation: params_scope =>
            createOidcSpaUtilsBuilder({
                autoLogin: params.autoLogin,
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
            createOidcSpaUtils<User, AutoLogin, AccessTokenClaims>({
                autoLogin: params.autoLogin,
                createValidateAndGetAccessTokenClaims: params.createValidateAndGetAccessTokenClaims,
                createUser: params.createUser,
                user_mock: params.user_mock
            })
    };
}

export const oidcSpaUtilsBuilder = createOidcSpaUtilsBuilder<never, false, undefined>({
    autoLogin: false,
    createValidateAndGetAccessTokenClaims: undefined,
    createUser: undefined,
    user_mock: undefined
});
