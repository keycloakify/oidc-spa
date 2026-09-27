import type { OidcSpaUtils, CreateClientUser, CreateServerUser, RuntimeConfigs } from "./types";
import { createUtils } from "./createUtils";
import { assert } from "tsafe";
import type { OptionallyAsyncGetterOrDirectValue } from "../../tools/GetterOrDirectValue";

export type OidcSpa<
    User_client,
    User_server,
    AutoLogin extends boolean,
    Excluded extends "withAutoLogin" | "withClientUser" | "withServerUser" | "withRuntimeConfigs" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpa<User_client, User_server, true, Excluded | "withAutoLogin">;
        withClientUser: <User_client>(
            createClientUser: CreateClientUser<User_client>
        ) => OidcSpa<User_client, User_server, AutoLogin, Excluded | "withClientUser">;
        withServerUser: <User_server>(
            createServerUser: CreateServerUser<User_server>
        ) => OidcSpa<User_client, User_server, AutoLogin, Excluded | "withServerUser">;
    },
    Excluded
> &
    ("withServerUser" extends Excluded
        ? {
              withRuntimeConfigs: (
                  getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<
                      { process: { env: Record<string, string> } },
                      RuntimeConfigs<User_client, User_server, AutoLogin>
                  >
              ) => OidcSpa<User_client, User_server, AutoLogin, Excluded | "withRuntimeConfigs">;
          }
        : {}) &
    ("withRuntimeConfigs" extends Excluded
        ? {
              createUtils: () => OidcSpaUtils<User_client, User_server, AutoLogin>;
          }
        : {});

function createOidcSpa<User_client, User_server, AutoLogin extends boolean>(params: {
    autoLogin: AutoLogin;
    createClientUser: CreateClientUser<User_client> | undefined;
    createServerUser: CreateServerUser<User_server> | undefined;
    getRuntimeConfigsOrRuntimeConfigs:
        | OptionallyAsyncGetterOrDirectValue<
              { process: { env: Record<string, string> } },
              RuntimeConfigs<User_client, any, any>
          >
        | undefined;
}): OidcSpa<User_client, User_server, AutoLogin> {
    return {
        withAutoLogin: () =>
            createOidcSpa({
                autoLogin: true,
                createClientUser: params.createClientUser,
                createServerUser: params.createServerUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            }),
        withClientUser: createClientUser =>
            createOidcSpa({
                autoLogin: params.autoLogin,
                createClientUser,
                createServerUser: params.createServerUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            }) as any,
        withServerUser: createServerUser =>
            createOidcSpa({
                autoLogin: params.autoLogin,
                createClientUser: params.createClientUser,
                createServerUser: createServerUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            }) as any,
        // @ts-expect-error
        createUtils: () => {
            assert(params.createClientUser !== undefined);
            assert(params.getRuntimeConfigsOrRuntimeConfigs !== undefined);
            return createUtils({
                autoLogin: params.autoLogin,
                createClientUser: params.createClientUser,
                createServerUser: params.createServerUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            });
        }
    };
}

export const oidcSpa = createOidcSpa<unknown, undefined, false>({
    autoLogin: false,
    createClientUser: undefined,
    createServerUser: undefined,
    getRuntimeConfigsOrRuntimeConfigs: undefined
});
