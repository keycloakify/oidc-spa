import type { OidcSpaUtils } from "./types";
import type { Oidc as Oidc_core } from "../core";
import type { ZodSchemaLike } from "../tools/ZodSchemaLike";
import { createOidcSpaUtils } from "./createOidcSpaUtils";
import type { MaybeAsync } from "../tools/MaybeAsync";

export type OidcSpaUtilsBuilder<
    AutoLogin extends boolean = false,
    DecodedIdToken extends Record<string, unknown> = Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
    User = never,
    ExcludedMethod extends
        | "withAutoLogin"
        | "withExpectedDecodedIdTokenShape"
        | "withUserAbstraction"
        | "createUtils" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpaUtilsBuilder<
            true,
            DecodedIdToken,
            User,
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
            ExcludedMethod | "withExpectedDecodedIdTokenShape"
        >;
        withUser: <User>(params: {
            createUser: (params: {
                decodedIdToken: Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec;
                accessToken: string;
                fetchUserInfo: () => Promise<{
                    [key: string]: unknown;
                    sub: string;
                }>;
                issuerUri: string;
            }) => MaybeAsync<User>;
            user_mock?: NoInfer<User>;
        }) => OidcSpaUtilsBuilder<
            AutoLogin,
            DecodedIdToken,
            User,
            ExcludedMethod | "withUserAbstraction"
        >;
        createUtils: () => OidcSpaUtils<AutoLogin, DecodedIdToken, User>;
    },
    ExcludedMethod
>;

function createOidcSpaUtilsBuilder<
    AutoLogin extends boolean = false,
    DecodedIdToken extends Record<string, unknown> = Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec,
    User = never
>(params: {
    autoLogin: AutoLogin;
    decodedIdTokenSchema:
        | ZodSchemaLike<Oidc_core.Tokens.DecodedIdToken_OidcCoreSpec, DecodedIdToken>
        | undefined;
    decodedIdToken_mock: DecodedIdToken | undefined;
    createUser:
        | ((params: { decodedIdToken: DecodedIdToken; accessToken: string }) => MaybeAsync<User>)
        | undefined;
    user_mock: User | undefined;
}): OidcSpaUtilsBuilder<AutoLogin, DecodedIdToken, User> {
    return {
        withAutoLogin: () =>
            createOidcSpaUtilsBuilder({
                autoLogin: true,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock,
                createUser: params.createUser,
                user_mock: params.user_mock
            }),
        withExpectedDecodedIdTokenShape: ({ decodedIdTokenSchema, decodedIdToken_mock }) => {
            return createOidcSpaUtilsBuilder<AutoLogin, any, User>({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema,
                decodedIdToken_mock,
                createUser: params.createUser,
                user_mock: params.user_mock
            });
        },
        withUser: ({ createUser, user_mock }) => {
            return createOidcSpaUtilsBuilder<AutoLogin, DecodedIdToken, any>({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock,
                // @ts-expect-error
                createUser,
                user_mock
            });
        },
        createUtils: () =>
            createOidcSpaUtils<AutoLogin, DecodedIdToken, User>({
                autoLogin: params.autoLogin,
                decodedIdTokenSchema: params.decodedIdTokenSchema,
                decodedIdToken_mock: params.decodedIdToken_mock,
                createUser: params.createUser,
                user_mock: params.user_mock
            })
    };
}

export const oidcSpaUtilsBuilder = createOidcSpaUtilsBuilder({
    autoLogin: false,
    decodedIdToken_mock: undefined,
    decodedIdTokenSchema: undefined,
    createUser: undefined,
    user_mock: undefined
});
