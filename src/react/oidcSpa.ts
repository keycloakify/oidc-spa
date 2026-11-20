import type { OidcSpaUtils, CreateClientUser, RuntimeConfigs } from "./types";
import { createUtils } from "./createUtils";
import { assert } from "../tools/tsafe/assert";
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";

export type OidcSpa<User, Excluded extends "withUser" | "withRuntimeConfigs" = never> = Omit<
    {
        withUser: <User>(
            createClientUser: CreateClientUser<User>
        ) => OidcSpa<User, Excluded | "withUser">;
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
    createClientUser: CreateClientUser<User> | undefined;
    getRuntimeConfigsOrRuntimeConfigs:
        | OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>
        | undefined;
}): OidcSpa<User> {
    return {
        withUser: createClientUser =>
            createOidcSpa({
                createClientUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            }) as any,
        // @ts-expect-error
        withRuntimeConfigs: getRuntimeConfigsOrRuntimeConfigs =>
            createOidcSpa({
                createClientUser: params.createClientUser,
                getRuntimeConfigsOrRuntimeConfigs
            }) as any,
        createUtils: () => {
            assert(params.createClientUser !== undefined);
            assert(params.getRuntimeConfigsOrRuntimeConfigs !== undefined);
            return createUtils({
                createClientUser: params.createClientUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs
            });
        }
    };
}

export const oidcSpa = createOidcSpa<unknown>({
    createClientUser: undefined,
    getRuntimeConfigsOrRuntimeConfigs: undefined
});
