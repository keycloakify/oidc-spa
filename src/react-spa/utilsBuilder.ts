import type { OidcSpaUtils, CreateUser } from "./types";
import { createOidcSpaUtils } from "./createOidcSpaUtils";

export type OidcSpaUtilsBuilder<
    User,
    AutoLogin,
    ExcludedMethod extends "withAutoLogin" | "withUser" | "createUtils" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpaUtilsBuilder<User, true, ExcludedMethod | "withAutoLogin">;
        withUser: <User>(params: {
            createUser: CreateUser<User>;
            user_mock?: NoInfer<User>;
        }) => OidcSpaUtilsBuilder<User, AutoLogin, ExcludedMethod | "withUser">;
        createUtils: () => OidcSpaUtils<User, AutoLogin>;
    },
    ExcludedMethod
>;

function createOidcSpaUtilsBuilder<User = never, AutoLogin extends boolean = false>(params: {
    autoLogin: AutoLogin;
    createUser: CreateUser<User> | undefined;
    user_mock: User | undefined;
}): OidcSpaUtilsBuilder<User, AutoLogin> {
    return {
        withAutoLogin: () =>
            createOidcSpaUtilsBuilder({
                autoLogin: true,
                createUser: params.createUser,
                user_mock: params.user_mock
            }),
        withUser: ({ createUser, user_mock }) => {
            return createOidcSpaUtilsBuilder<any, AutoLogin>({
                autoLogin: params.autoLogin,
                createUser,
                user_mock
            });
        },
        createUtils: () =>
            createOidcSpaUtils<User, AutoLogin>({
                autoLogin: params.autoLogin,
                createUser: params.createUser,
                user_mock: params.user_mock
            })
    };
}

export const oidcSpaUtilsBuilder = createOidcSpaUtilsBuilder<never, false>({
    autoLogin: false,
    createUser: undefined,
    user_mock: undefined
});
