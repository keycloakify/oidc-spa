import type { OidcSpaUtils, CreateClientUser, RuntimeConfigs } from "./types";
import { createUtils } from "./createUtils";
import { assert } from "../tools/tsafe/assert";
import type { OptionallyAsyncGetterOrDirectValue } from "../tools/GetterOrDirectValue";

export type OidcSpa<
    User,
    IsClientOnly extends boolean = false,
    Excluded extends "withUser" | "withRuntimeConfigs" | "withClientOnly" = never
> = Omit<
    {
        /**
         * Enable client-only optimizations and suspensePromise. Components using
         * these utilities must never render on the server, including at build time.
         */
        withClientOnly: () => OidcSpa<User, true, Excluded | "withClientOnly">;
        withUser: <User>(
            createClientUser: CreateClientUser<User>
        ) => OidcSpa<User, IsClientOnly, Excluded | "withUser">;
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
              ) => OidcSpa<User, IsClientOnly, Excluded | "withRuntimeConfigs">;
          }
        : {}) &
    ("withRuntimeConfigs" extends Excluded
        ? {
              createUtils: () => OidcSpaUtils<User, IsClientOnly>;
          }
        : {});

function createOidcSpa<User, IsClientOnly extends boolean>(params: {
    createClientUser: CreateClientUser<User> | undefined;
    getRuntimeConfigsOrRuntimeConfigs:
        | OptionallyAsyncGetterOrDirectValue<void, RuntimeConfigs>
        | undefined;
    isClientOnly: IsClientOnly;
}): OidcSpa<User, IsClientOnly> {
    return {
        withClientOnly: () =>
            createOidcSpa({
                createClientUser: params.createClientUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs,
                isClientOnly: true
            }),
        withUser: createClientUser =>
            createOidcSpa({
                createClientUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs,
                isClientOnly: params.isClientOnly
            }) as any,
        // @ts-expect-error
        withRuntimeConfigs: getRuntimeConfigsOrRuntimeConfigs =>
            createOidcSpa({
                createClientUser: params.createClientUser,
                getRuntimeConfigsOrRuntimeConfigs,
                isClientOnly: params.isClientOnly
            }) as any,
        createUtils: () => {
            assert(params.createClientUser !== undefined);
            assert(params.getRuntimeConfigsOrRuntimeConfigs !== undefined);
            return createUtils({
                createClientUser: params.createClientUser,
                getRuntimeConfigsOrRuntimeConfigs: params.getRuntimeConfigsOrRuntimeConfigs,
                isClientOnly: params.isClientOnly
            });
        }
    };
}

export const oidcSpa = createOidcSpa<unknown, false>({
    createClientUser: undefined,
    getRuntimeConfigsOrRuntimeConfigs: undefined,
    isClientOnly: false
});
