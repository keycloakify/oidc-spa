import type { OidcSpaUtils, CreateClientUser } from "./types";
import { createUtils } from "./createUtils";
import { assert } from "../tools/tsafe/assert";

export type OidcSpa<
    User,
    AutoLogin extends boolean,
    Excluded extends "withAutoLogin" | "withUser" | "withNonBlockingRendering" = never
> = Omit<
    {
        withAutoLogin: () => OidcSpa<User, true, Excluded | "withAutoLogin">;
        withUser: <User>(
            createUser: CreateClientUser<User>
        ) => OidcSpa<User, AutoLogin, Excluded | "withUser">;
        withNonBlockingRendering: () => OidcSpa<User, AutoLogin, Excluded | "withNonBlockingRendering">;
    },
    Excluded
> &
    ("withUser" extends Excluded
        ? {
              createUtils: () => OidcSpaUtils<User, AutoLogin>;
          }
        : {});

function createOidcSpa<User, AutoLogin extends boolean>(params: {
    autoLogin: AutoLogin;
    providerAwaitsInitialization: boolean;
    createUser: CreateClientUser<User> | undefined;
}): OidcSpa<User, AutoLogin> {
    return {
        withAutoLogin: () => createOidcSpa({ ...params, autoLogin: true }),
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

export const oidcSpa = createOidcSpa<unknown, false>({
    autoLogin: false,
    providerAwaitsInitialization: true,
    createUser: undefined
});
