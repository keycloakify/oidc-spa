import type { OidcSpaUtils, CreateUser, ParamsOfWithAccessTokenValidation } from "./types";
import type { DecodedAccessToken_RFC9068 as AccessTokenClaims_RFC9068 } from "../../server";
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
        withAccessTokenValidation: <
            AccessTokenClaims extends Record<string, unknown> = AccessTokenClaims_RFC9068
        >(
            params: ParamsOfWithAccessTokenValidation<AccessTokenClaims>
        ) => OidcSpaUtilsBuilder<
            User,
            AutoLogin,
            AccessTokenClaims,
            ExcludedMethod | "withAccessTokenValidation"
        >;
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
    paramsOfWithAccessTokenValidation: ParamsOfWithAccessTokenValidation<AccessTokenClaims> | undefined;
    createUser: CreateUser<User> | undefined;
    user_mock: User | undefined;
}): OidcSpaUtilsBuilder<User, AutoLogin, AccessTokenClaims> {
    return {
        withAutoLogin: () =>
            createOidcSpaUtilsBuilder({
                autoLogin: true,
                paramsOfWithAccessTokenValidation: params.paramsOfWithAccessTokenValidation,
                createUser: params.createUser,
                user_mock: params.user_mock
            }),
        withUser: ({ createUser, user_mock }) =>
            createOidcSpaUtilsBuilder({
                autoLogin: params.autoLogin,
                paramsOfWithAccessTokenValidation: params.paramsOfWithAccessTokenValidation,
                createUser,
                user_mock
            }),
        withAccessTokenValidation: params_scope =>
            createOidcSpaUtilsBuilder({
                autoLogin: params.autoLogin,
                createUser: params.createUser,
                user_mock: params.user_mock,
                paramsOfWithAccessTokenValidation: params_scope
            }),
        createUtils: () =>
            createOidcSpaUtils<User, AutoLogin, AccessTokenClaims>({
                autoLogin: params.autoLogin,
                paramsOfWithAccessTokenValidation: params.paramsOfWithAccessTokenValidation,
                createUser: params.createUser,
                user_mock: params.user_mock
            })
    };
}

export const oidcSpaUtilsBuilder = createOidcSpaUtilsBuilder<never, false, undefined>({
    autoLogin: false,
    paramsOfWithAccessTokenValidation: undefined,
    createUser: undefined,
    user_mock: undefined
});
