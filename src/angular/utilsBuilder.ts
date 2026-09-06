import type { CreateUser, OidcSpaUtils } from "./types";
import { createOidcSpaUtils } from "./createOidcSpaUtils";

export type OidcSpaUtilsBuilder<
    AutoLogin extends boolean = false,
    User = never,
    ExcludedMethod extends "withAutoLogin" | "withUser" | "withNonBlockingRendering" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpaUtilsBuilder<true, User, ExcludedMethod | "withAutoLogin">;
        withUser: <User>(params: {
            createUser: CreateUser<User>;
            user_mock?: NoInfer<User>;
        }) => OidcSpaUtilsBuilder<AutoLogin, User, ExcludedMethod | "withUser">;
        withNonBlockingRendering: () => OidcSpaUtilsBuilder<
            AutoLogin,
            User,
            ExcludedMethod | "withNonBlockingRendering"
        >;
        createUtils: () => OidcSpaUtils<AutoLogin, User>;
    },
    ExcludedMethod
>;

export type BuilderParams<AutoLogin extends boolean, User> = {
    autoLogin: AutoLogin;
    providerAwaitsInitialization: boolean;
    createUser: CreateUser<User> | undefined;
    user_mock: User | undefined;
};

function createOidcSpaUtilsBuilder<AutoLogin extends boolean, User>(
    params: BuilderParams<AutoLogin, User>
): OidcSpaUtilsBuilder<AutoLogin, User> {
    return {
        withAutoLogin: () => createOidcSpaUtilsBuilder({ ...params, autoLogin: true }),
        withUser: ({ createUser, user_mock }) =>
            createOidcSpaUtilsBuilder({ ...params, createUser, user_mock }),
        withNonBlockingRendering: () =>
            createOidcSpaUtilsBuilder({ ...params, providerAwaitsInitialization: false }),
        createUtils: () => createOidcSpaUtils(params)
    };
}

export const oidcSpaUtilsBuilder = createOidcSpaUtilsBuilder<false, never>({
    autoLogin: false,
    providerAwaitsInitialization: true,
    createUser: undefined,
    user_mock: undefined
});
