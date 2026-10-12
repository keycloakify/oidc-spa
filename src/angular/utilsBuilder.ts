import type { CreateUser, OidcSpaUtils } from "./types";
import { createOidcSpaUtils } from "./createOidcSpaUtils";

export type OidcSpaUtilsBuilder<
    User = never,
    AutoLogin extends boolean = false,
    ExcludedMethod extends "withAutoLogin" | "withUser" | "withNonBlockingRendering" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpaUtilsBuilder<User, true, ExcludedMethod | "withAutoLogin">;
        withUser: <User>(params: {
            createUser: CreateUser<User>;
            user_mock?: NoInfer<User>;
        }) => OidcSpaUtilsBuilder<User, AutoLogin, ExcludedMethod | "withUser">;
        withNonBlockingRendering: () => OidcSpaUtilsBuilder<
            User,
            AutoLogin,
            ExcludedMethod | "withNonBlockingRendering"
        >;
        createUtils: () => OidcSpaUtils<User, AutoLogin>;
    },
    ExcludedMethod
>;

function createOidcSpaUtilsBuilder<User = never, AutoLogin extends boolean = false>(params: {
    autoLogin: AutoLogin;
    providerAwaitsInitialization: boolean;
    createUser: CreateUser<User> | undefined;
    user_mock: User | undefined;
}): OidcSpaUtilsBuilder<User, AutoLogin> {
    return {
        withAutoLogin: () =>
            createOidcSpaUtilsBuilder({
                autoLogin: true,
                providerAwaitsInitialization: params.providerAwaitsInitialization,
                createUser: params.createUser,
                user_mock: params.user_mock
            }),
        withUser: ({ createUser, user_mock }) =>
            createOidcSpaUtilsBuilder({
                autoLogin: params.autoLogin,
                providerAwaitsInitialization: params.providerAwaitsInitialization,
                createUser,
                user_mock
            }),
        withNonBlockingRendering: () =>
            createOidcSpaUtilsBuilder({
                autoLogin: params.autoLogin,
                providerAwaitsInitialization: false,
                createUser: params.createUser,
                user_mock: params.user_mock
            }),
        createUtils: () =>
            createOidcSpaUtils({
                autoLogin: params.autoLogin,
                providerAwaitsInitialization: params.providerAwaitsInitialization,
                createUser: params.createUser,
                user_mock: params.user_mock
            })
    };
}

export const oidcSpaUtilsBuilder = createOidcSpaUtilsBuilder<never, false>({
    autoLogin: false,
    providerAwaitsInitialization: true,
    createUser: undefined,
    user_mock: undefined
});
