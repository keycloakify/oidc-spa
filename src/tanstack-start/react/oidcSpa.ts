import type { OidcSpaUtils, CreateClientUser, CreateServerUser, RuntimeConfigs } from "./types";
import { createUtils } from "./createUtils";
import { assert } from "../../tools/tsafe/assert";
import type { OptionallyAsyncGetterOrDirectValue } from "../../tools/GetterOrDirectValue";

export type OidcSpa<
    User_client,
    User_server,
    Excluded extends "withClientUser" | "withServerUser" | "withRuntimeConfigs" = never
> = Omit<
    {
        withClientUser: <User_client>(
            createClientUser: CreateClientUser<User_client>
        ) => OidcSpa<User_client, User_server, Excluded | "withClientUser">;
        withServerUser: <User_server>(
            createServerUser: CreateServerUser<User_server>
        ) => OidcSpa<User_client, User_server, Excluded | "withServerUser">;
    },
    Excluded
> &
    ("withClientUser" extends Excluded
        ? {
              withRuntimeConfigs: (
                  getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<
                      { process: { env: Record<string, string> } },
                      RuntimeConfigs<User_server>
                  >
              ) => OidcSpa<User_client, User_server, Excluded | "withRuntimeConfigs" | "withServerUser">;
          }
        : {}) &
    ("withRuntimeConfigs" extends Excluded
        ? {
              createUtils: () => OidcSpaUtils<User_client, User_server>;
          }
        : {});

function createOidcSpa<User_client, User_server>(params: {
    createClientUser: CreateClientUser<User_client> | undefined;
    createServerUser: CreateServerUser<User_server> | undefined;
    getRuntimeConfigsOrRuntimeConfigs:
        | OptionallyAsyncGetterOrDirectValue<
              { process: { env: Record<string, string> } },
              RuntimeConfigs<any>
          >
        | undefined;
}): OidcSpa<User_client, User_server> {
    return {
        withClientUser: createClientUser =>
            createOidcSpa({
                createClientUser,
                createServerUser: params.createServerUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            }) as any,
        withServerUser: createServerUser =>
            createOidcSpa({
                createClientUser: params.createClientUser,
                createServerUser: createServerUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            }) as any,
        // @ts-expect-error
        withRuntimeConfigs: getRuntimeConfigsOrRuntimeConfigs =>
            createOidcSpa({
                createClientUser: params.createClientUser,
                createServerUser: params.createServerUser,
                getRuntimeConfigsOrRuntimeConfigs
            }) as any,
        createUtils: () => {
            assert(params.createClientUser !== undefined);
            assert(params.getRuntimeConfigsOrRuntimeConfigs !== undefined);
            return createUtils({
                createClientUser: params.createClientUser,
                createServerUser: params.createServerUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            });
        }
    };
}

export const oidcSpa = createOidcSpa<unknown, undefined>({
    createClientUser: undefined,
    createServerUser: undefined,
    getRuntimeConfigsOrRuntimeConfigs: undefined
});
