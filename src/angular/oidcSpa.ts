import type { OidcSpaUtils, CreateClientUser } from "./types";
import { createUtils } from "./createUtils";
import { assert } from "../tools/tsafe/assert";

export type OidcSpa<User, Excluded extends "withUser" | "withNonBlockingRendering" = never> = Omit<
    {
        withUser: <User>(createUser: CreateClientUser<User>) => OidcSpa<User, Excluded | "withUser">;
        withNonBlockingRendering: () => OidcSpa<User, Excluded | "withNonBlockingRendering">;
    },
    Excluded
> &
    ("withUser" extends Excluded
        ? {
              createUtils: () => OidcSpaUtils<User>;
          }
        : {});

function createOidcSpa<User>(params: {
    providerAwaitsInitialization: boolean;
    createUser: CreateClientUser<User> | undefined;
}): OidcSpa<User> {
    return {
        withUser: createUser => createOidcSpa({ ...params, createUser }) as any,
        withNonBlockingRendering: () =>
            createOidcSpa({ ...params, providerAwaitsInitialization: false }),
        // @ts-expect-error Only exposed after withUser(), as in the React SPA adapter.
        createUtils: () => {
            assert(params.createUser !== undefined);
            return createUtils({ ...params, createUser: params.createUser });
        }
    };
}

export const oidcSpa = createOidcSpa<unknown>({
    providerAwaitsInitialization: true,
    createUser: undefined
});
