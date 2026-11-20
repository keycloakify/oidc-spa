import type { OidcSpaUtils, CreateClientUser } from "./types";
import { createUtils } from "./createUtils";
import { assert } from "../tools/tsafe/assert";

export type OidcSpa<User, Excluded extends "withUser" = never> = Omit<
    {
        withUser: <User>(createUser: CreateClientUser<User>) => OidcSpa<User, Excluded | "withUser">;
    },
    Excluded
> &
    ("withUser" extends Excluded
        ? {
              createUtils: () => OidcSpaUtils<User>;
          }
        : {});

function createOidcSpa<User>(params: { createUser: CreateClientUser<User> | undefined }): OidcSpa<User> {
    return {
        withUser: createUser => createOidcSpa({ ...params, createUser }) as any,
        // @ts-expect-error Only exposed after withUser(), as in the React SPA adapter.
        createUtils: () => {
            assert(params.createUser !== undefined);
            return createUtils({ ...params, createUser: params.createUser });
        }
    };
}

export const oidcSpa = createOidcSpa<unknown>({
    createUser: undefined
});
