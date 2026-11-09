import type { OidcSpaUtils, CreateClientUser, RuntimeConfigs } from "./types";
import { createUtils } from "./createUtils";
import { assert } from "../tools/tsafe/assert";
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";

export type OidcSpa<User, Excluded extends "withUser" | "withRuntimeConfigs" = never> = Omit<
    {
        withUser: <User>(createUser: CreateClientUser<User>) => OidcSpa<User, Excluded | "withUser">;
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
              ) => OidcSpa<User, Excluded | "withRuntimeConfigs">;
          }
        : {}) &
    ("withRuntimeConfigs" extends Excluded
        ? {
              createUtils: () => OidcSpaUtils<User>;
          }
        : {});

function createOidcSpa<User>(params: {
    createUser: CreateClientUser<User> | undefined;
    getRuntimeConfigsOrRuntimeConfigs:
        | OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>
        | undefined;
}): OidcSpa<User> {
    return {
        withUser: createUser =>
            createOidcSpa({
                createUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            }) as any,
        // @ts-expect-error
        withRuntimeConfigs: (
            getRuntimeConfigsOrRuntimeConfigs: OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>
        ) =>
            createOidcSpa({
                ...params,
                getRuntimeConfigsOrRuntimeConfigs
            }),
        createUtils: () => {
            assert(params.createUser !== undefined);
            assert(params.getRuntimeConfigsOrRuntimeConfigs !== undefined);
            return createUtils({
                createUser: params.createUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            });
        }
    };
}

export const oidcSpa = createOidcSpa<unknown>({
    createUser: undefined,
    getRuntimeConfigsOrRuntimeConfigs: undefined
});
