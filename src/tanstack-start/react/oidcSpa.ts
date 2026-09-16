import type { OidcSpaUtils, CreateClientUser, CreateServerUser } from "./types";
import { createUtils } from "./createOidcSpaUtils";
import { assert } from "tsafe";

export type OidcSpa<
    User_client,
    User_server,
    AutoLogin extends boolean,
    Excluded extends "withAutoLogin" | "withClientUser" | "withServerUser" = never
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
    ("withClientUser" extends Excluded
        ? {
              createUtils: () => OidcSpaUtils<User_client, User_server, AutoLogin>;
          }
        : {});

function createOidcSpa<User_client, User_server, AutoLogin extends boolean>(params: {
    autoLogin: AutoLogin;
    createClientUser: CreateClientUser<User_client> | undefined;
    createServerUser: CreateServerUser<User_server> | undefined;
}): OidcSpa<User_client, User_server, AutoLogin> {
    return {
        withAutoLogin: () =>
            createOidcSpa({
                autoLogin: true,
                createClientUser: params.createClientUser,
                createServerUser: params.createServerUser
            }),
        withClientUser: createClientUser =>
            createOidcSpa({
                autoLogin: params.autoLogin,
                createClientUser,
                createServerUser: params.createServerUser
            }) as any,
        withServerUser: createServerUser =>
            createOidcSpa({
                autoLogin: params.autoLogin,
                createClientUser: params.createClientUser,
                createServerUser
            }),
        // @ts-expect-error
        createUtils: () => {
            assert(params.createClientUser !== undefined);
            return createUtils({
                autoLogin: params.autoLogin,
                createClientUser: params.createClientUser,
                createServerUser: params.createServerUser
            });
        }
    };
}

export const oidcSpa = createOidcSpa<unknown, never, false>({
    autoLogin: false,
    createClientUser: undefined,
    createServerUser: undefined
});
