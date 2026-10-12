import type { OidcSpaUtils, CreateClientUser, RuntimeConfigs } from "./types";
import { createUtils } from "./createUtils";
import { assert } from "tsafe";
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";

export type OidcSpa<
    User,
    AutoLogin extends boolean,
    Excluded extends "withAutoLogin" | "withUser" | "withRuntimeConfigs" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpa<User, true, Excluded | "withAutoLogin">;
        withUser: <User>(
            createUser: CreateClientUser<User>
        ) => OidcSpa<User, AutoLogin, Excluded | "withUser">;
    },
    Excluded
> &
    ("withUser" extends Excluded
        ? {
              withRuntimeConfigs: (
                  getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<
                      void,
                      RuntimeConfigs
                  >
              ) => OidcSpa<User, AutoLogin, Excluded | "withRuntimeConfigs">;
          }
        : {}) &
    ("withRuntimeConfigs" extends Excluded
        ? {
              createUtils: () => OidcSpaUtils<User, AutoLogin>;
          }
        : {});

function createOidcSpa<User, AutoLogin extends boolean>(params: {
    autoLogin: AutoLogin;
    createUser: CreateClientUser<User> | undefined;
    getRuntimeConfigsOrRuntimeConfigs:
        | OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>
        | undefined;
}): OidcSpa<User, AutoLogin> {
    return {
        withAutoLogin: () =>
            createOidcSpa({
                autoLogin: true,
                createUser: params.createUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            }),
        withUser: createUser =>
            createOidcSpa({
                autoLogin: params.autoLogin,
                createUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            }) as any,
        // @ts-expect-error
        createUtils: () => {
            assert(params.createUser !== undefined);
            assert(params.getRuntimeConfigsOrRuntimeConfigs !== undefined);
            return createUtils({
                autoLogin: params.autoLogin,
                createUser: params.createUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            });
        }
    };
}

export const oidcSpa = createOidcSpa<unknown, false>({
    autoLogin: false,
    createUser: undefined,
    getRuntimeConfigsOrRuntimeConfigs: undefined
});
